import sys
import os
from fastapi import HTTPException

# Adjust path to import backend and models
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import SessionLocal
from models import User, Task, Project, Team, Role
from backend import update_task, delete_task, create_task

def run_lifecycle_verification():
    print("======================================================================")
    print("      SERVICE LIFE-CYCLE & WRITING RLS SECURITY VERIFICATION          ")
    print("======================================================================")

    db = SessionLocal()
    try:
        # Pre-test cleanup: remove any orphaned test tasks from prior runs
        db.query(Task).filter(Task.title.in_([
            "Temp Peer Review Task", 
            "Unauthorized Metadata Edit", 
            "Authorized Admin Edit", 
            "Assigned Task Compliance Check"
        ])).delete()
        db.commit()

        # 1. Retrieve key users
        admin_user = db.query(User).filter_by(username="admin").first()
        dev_leader = db.query(User).filter_by(username="dev_leader").first()
        dev_user = db.query(User).filter_by(username="dev_user").first()

        if not admin_user or not dev_leader or not dev_user:
            print("❌ Setup Error: Could not locate test users.")
            sys.exit(1)

        print(f"✅ Loaded Users: Admin ({admin_user.username}), Leader ({dev_leader.username}), Member ({dev_user.username})")

        # 2. Test 1: Writing RLS Bypass Prevention (Leader trying to modify a management/global project's task)
        # Find a task not belonging to dev_leader's team (e.g. team_id != 2 which is Dev Team)
        other_team_task = db.query(Task).filter(Task.team_id != 2).first()
        if other_team_task:
            print(f"Test 1: dev_leader (Team 2) attempting to update task '{other_team_task.title}' (Team {other_team_task.team_id}) under RLS...")
            try:
                update_task(
                    task_id=other_team_task.id,
                    body={"title": "Malicious Title Change"},
                    user_id=dev_leader.id,
                    db=db
                )
                print("  ❌ Failed: Writing RLS was bypassed! Leader could update a task in another team.")
                sys.exit(1)
            except HTTPException as he:
                if he.status_code == 403:
                    print(f"  ✅ Passed: Correctly blocked with {he.status_code} - '{he.detail}'")
                else:
                    print(f"  ❌ Failed: Blocked but with wrong status code {he.status_code}")
                    sys.exit(1)
        else:
            print("ℹ️ Skipping Test 1: No cross-team tasks found in DB.")

        # 3. Test 2: State-Based Deletion Guards (Leader trying to delete an in_progress task)
        # Fetch or create an in_progress task belonging to dev_leader's team (Team 2)
        dev_task = db.query(Task).filter_by(team_id=2, status="in_progress").first()
        if not dev_task:
            # Fallback: look for any dev task and force status to in_progress
            dev_task = db.query(Task).filter_by(team_id=2).first()
            if dev_task:
                dev_task.status = "in_progress"
                db.commit()

        if dev_task:
            print(f"Test 2: dev_leader attempting to delete active task '{dev_task.title}' (Status: {dev_task.status})...")
            try:
                delete_task(task_id=dev_task.id, user_id=dev_leader.id, db=db)
                print("  ❌ Failed: Leader was allowed to delete an active task in progress.")
                sys.exit(1)
            except HTTPException as he:
                if he.status_code == 400 and "Compliance Alert" in he.detail:
                    print(f"  ✅ Passed: Correctly blocked with {he.status_code} - '{he.detail}'")
                else:
                    print(f"  ❌ Failed: Got unexpected error: {he.status_code} - '{he.detail}'")
                    sys.exit(1)
        else:
            print("ℹ️ Skipping Test 2: No active team task found.")

        # 4. Test 3: Backend SOC 2 Segregation of Duties (SoD) Guard (Leader trying to self-approve a task they are assigned to)
        # Query first available project from database dynamically to satisfy FK constraint
        test_project = db.query(Project).first()
        if not test_project:
            print("❌ Setup Error: No project found in database.")
            sys.exit(1)
            
        # Create a temporary task assigned to dev_leader, status in_progress
        temp_task = Task(
            project_id=test_project.id,
            title="Temp Peer Review Task",
            status="in_progress",
            assignee_id=dev_leader.id,
            created_by_id=dev_leader.id,
            team_id=2,
            phase_id=1
        )
        db.add(temp_task)
        db.commit()

        print(f"Test 3: dev_leader attempting to self-approve assigned task {temp_task.id} directly to 'done'...")
        try:
            update_task(
                task_id=temp_task.id,
                body={"status": "done"},
                user_id=dev_leader.id,
                db=db
            )
            print("  ❌ Failed: Segregation of Duties bypassed! Leader could self-approve their own task.")
            sys.exit(1)
        except HTTPException as he:
            if he.status_code == 403 and "Segregation of Duties" in he.detail:
                print(f"  ✅ Passed: Correctly blocked with {he.status_code} - '{he.detail}'")
            else:
                print(f"  ❌ Failed: Got unexpected error: {he.status_code} - '{he.detail}'")
                sys.exit(1)

        # 5. Test 4: Task Reopening Guards (Member trying to reopen a completed/done task)
        # Set temp_task to done using admin bypass (admin is allowed to bypass SoD)
        update_task(
            task_id=temp_task.id,
            body={"status": "done"},
            user_id=admin_user.id,
            db=db
        )
        # Reload task to ensure status is done
        db.refresh(temp_task)
        assert temp_task.status == "done", "Admin failed to approve task for setup"
        print(f"ℹ️ Temp task successfully approved and closed.")

        print(f"Test 4: dev_user attempting to reopen closed task {temp_task.id} back to 'todo'...")
        try:
            update_task(
                task_id=temp_task.id,
                body={"status": "todo"},
                user_id=dev_user.id,
                db=db
            )
            print("  ❌ Failed: Standard member was allowed to reopen a closed/approved task.")
            sys.exit(1)
        except HTTPException as he:
            if he.status_code == 403 and "reopen approved tasks" in he.detail:
                print(f"  ✅ Passed: Correctly blocked with {he.status_code} - '{he.detail}'")
            else:
                print(f"  ❌ Failed: Got unexpected error: {he.status_code} - '{he.detail}'")
                sys.exit(1)

        # 6. Test 5: Assigned Task Safeguards (Leader blocked from metadata edit/delete, Admin allowed)
        # Create a task assigned to dev_user (Team 2)
        assigned_task = Task(
            project_id=test_project.id,
            title="Assigned Task Compliance Check",
            status="todo",
            assignee_id=dev_user.id,
            created_by_id=dev_leader.id,
            team_id=2,
            phase_id=1
        )
        db.add(assigned_task)
        db.commit()
        db.refresh(assigned_task)

        print(f"Test 5a: dev_leader attempting to modify title of assigned task {assigned_task.id}...")
        try:
            update_task(
                task_id=assigned_task.id,
                body={"title": "Unauthorized Metadata Edit"},
                user_id=dev_leader.id,
                db=db
            )
            print("  ❌ Failed: Leader edited an assigned task's metadata.")
            sys.exit(1)
        except HTTPException as he:
            if he.status_code == 403 and "Once a task is assigned" in he.detail:
                print(f"  ✅ Passed: Correctly blocked with {he.status_code} - '{he.detail}'")
            else:
                print(f"  ❌ Failed: Got unexpected error: {he.status_code} - '{he.detail}'")
                sys.exit(1)

        print(f"Test 5b: dev_leader attempting to delete assigned task {assigned_task.id}...")
        try:
            delete_task(
                task_id=assigned_task.id,
                user_id=dev_leader.id,
                db=db
            )
            print("  ❌ Failed: Leader deleted an assigned task.")
            sys.exit(1)
        except HTTPException as he:
            if he.status_code == 400 and "Assigned tasks can only be deleted" in he.detail:
                print(f"  ✅ Passed: Correctly blocked with {he.status_code} - '{he.detail}'")
            else:
                print(f"  ❌ Failed: Got unexpected error: {he.status_code} - '{he.detail}'")
                sys.exit(1)

        print(f"Test 5c: admin attempting to modify title of assigned task {assigned_task.id}...")
        try:
            update_task(
                task_id=assigned_task.id,
                body={"title": "Authorized Admin Edit"},
                user_id=admin_user.id,
                db=db
            )
            db.refresh(assigned_task)
            if assigned_task.title == "Authorized Admin Edit":
                print("  ✅ Passed: Admin successfully edited assigned task's metadata.")
            else:
                print("  ❌ Failed: Admin edit succeeded API-wise but title did not update.")
                sys.exit(1)
        except Exception as e:
            print(f"  ❌ Failed: Admin edit threw error: {e}")
            sys.exit(1)

        print(f"Test 5d: admin attempting to delete assigned task {assigned_task.id}...")
        try:
            delete_task(
                task_id=assigned_task.id,
                user_id=admin_user.id,
                db=db
            )
            deleted_check = db.query(Task).filter_by(id=assigned_task.id).first()
            if not deleted_check:
                print("  ✅ Passed: Admin successfully deleted assigned task.")
            else:
                print("  ❌ Failed: Admin delete succeeded API-wise but task still exists in DB.")
                sys.exit(1)
        except Exception as e:
            print(f"  ❌ Failed: Admin delete threw error: {e}")
            sys.exit(1)

        # 7. Test 6: Dynamic Project Visibility Scoping (Dynamic Permissions Matrix)
        from backend import get_projects, get_user_team_ids
        from models import RolePermission, Permission
        
        # Determine dev_leader role
        leader_role = db.query(Role).filter_by(id=dev_leader.role_id).first()
        read_all_perm = db.query(Permission).filter_by(code="can_read_all_projects:Project").first()
        
        if leader_role and read_all_perm:
            print(f"Test 6a: dev_leader with 'can_read_all_projects:Project' enabled. Fetching all projects...")
            # Ensure the permission is mapped for leaders
            mapping = db.query(RolePermission).filter_by(role_id=leader_role.id, permission_id=read_all_perm.id).first()
            if not mapping:
                mapping = RolePermission(role_id=leader_role.id, permission_id=read_all_perm.id)
                db.add(mapping)
                db.commit()
                
            all_projs_api = get_projects(user_id=dev_leader.id, db=db)
            total_db_projs = db.query(Project).count()
            print(f"  👉 API returned {len(all_projs_api)} projects (Total DB: {total_db_projs})")
            assert len(all_projs_api) == total_db_projs, "Failed Test 6a: dev_leader cannot read all projects even with can_read_all_projects permission!"
            print("  ✅ Passed: Dynamic transparency returns all global initiatives successfully.")
            
            # Now, simulate turning cross-team transparency OFF in the Admin Panel by deleting the mapping
            print(f"Test 6b: Removing 'can_read_all_projects:Project' mapping to leader role (siloing teams)...")
            db.query(RolePermission).filter_by(role_id=leader_role.id, permission_id=read_all_perm.id).delete()
            db.commit()
            
            # Clear or map other read parameters if any
            legacy_read_all = db.query(Permission).filter_by(code="analytics.read_all").first()
            had_legacy = False
            if legacy_read_all:
                legacy_mapping = db.query(RolePermission).filter_by(role_id=leader_role.id, permission_id=legacy_read_all.id).first()
                if legacy_mapping:
                    had_legacy = True
                    db.delete(legacy_mapping)
                    db.commit()
                    
            # Set the leader to read team projects
            read_team_perm = db.query(Permission).filter_by(code="can_read_team_projects:Project").first()
            added_team_mapping = False
            if read_team_perm:
                team_mapping = db.query(RolePermission).filter_by(role_id=leader_role.id, permission_id=read_team_perm.id).first()
                if not team_mapping:
                    added_team_mapping = True
                    db.add(RolePermission(role_id=leader_role.id, permission_id=read_team_perm.id))
                    db.commit()
            
            siloed_projs_api = get_projects(user_id=dev_leader.id, db=db)
            leader_team_ids = get_user_team_ids(db, dev_leader.id)
            expected_siloed_count = db.query(Project).filter(
                (Project.team_id.in_(leader_team_ids)) | (Project.assignee_id == dev_leader.id)
            ).count()
            print(f"  👉 API returned {len(siloed_projs_api)} projects (Expected Siloed Count: {expected_siloed_count})")
            
            # Restore the permissions state back to default
            db.add(RolePermission(role_id=leader_role.id, permission_id=read_all_perm.id))
            if had_legacy and legacy_read_all:
                db.add(RolePermission(role_id=leader_role.id, permission_id=legacy_read_all.id))
            if added_team_mapping and read_team_perm:
                db.query(RolePermission).filter_by(role_id=leader_role.id, permission_id=read_team_perm.id).delete()
            db.commit()
            
            assert len(siloed_projs_api) == expected_siloed_count, f"Failed Test 6b: Expected {expected_siloed_count} siloed projects, but API returned {len(siloed_projs_api)}!"
            print("  ✅ Passed: Dynamically blocks cross-team visibility when permission is removed in Admin Panel!")
        else:
            print("ℹ️ Skipping Test 6: Permissions not initialized in DB.")

        # 8. Test 7: Robust Task Status Transitions (Checking that None vs "" empty string mismatches do not block status transitions)
        # Create an assigned task with None values for optional metadata
        mismatch_task = Task(
            project_id=test_project.id,
            title="Assigned Mismatch Status Transition Check",
            status="todo",
            assignee_id=dev_user.id,
            created_by_id=dev_leader.id,
            team_id=2,
            phase_id=1,
            description=None,
            due_date=None,
            estimated_hours=None
        )
        db.add(mismatch_task)
        db.commit()
        db.refresh(mismatch_task)

        print(f"Test 7: dev_user updating status of task {mismatch_task.id} to 'in_progress' with empty metadata mapping (None vs '')...")
        try:
            update_task(
                task_id=mismatch_task.id,
                body={
                    "status": "in_progress",
                    # Send entire object spread emulation including empty strings
                    "title": mismatch_task.title,
                    "description": "",
                    "due_date": "",
                    "estimated_hours": "",
                    "assignee": "dev_user",
                    "team": "Development Team"
                },
                user_id=dev_user.id,
                db=db
            )
            db.refresh(mismatch_task)
            if mismatch_task.status == "in_progress":
                print("  ✅ Passed: Task status successfully transitioned without false-positive metadata blocks!")
            else:
                print("  ❌ Failed: Mismatch task status did not change.")
                sys.exit(1)
        except Exception as e:
            print(f"  ❌ Failed: Status change threw unexpected block/error: {e}")
            sys.exit(1)
            
        # Clean up Test 7 task
        db.delete(mismatch_task)
        db.commit()

        # Clean up temp task
        db.delete(temp_task)
        db.commit()
        print("✅ Cleanup of temporary test tasks completed.")

        print("======================================================================")
        print("    ALL SERVICE LIFECYCLE & WRITING RLS VERIFICATIONS PASSED!         ")
        print("======================================================================")

    except Exception as e:
        print(f"❌ Verification failed with error: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    run_lifecycle_verification()
