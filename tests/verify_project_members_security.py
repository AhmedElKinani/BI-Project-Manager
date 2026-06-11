import sys
import os
from fastapi import HTTPException

# Adjust path to import backend and models
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import SessionLocal
from models import User, Task, Project, Team, Role, ProjectMember, Phase
from backend import create_task, update_task, set_project_members

def run_project_members_security_verification():
    print("======================================================================")
    print("        PROJECT MEMBERSHIP & PHASE WRITE BOUNDARIES VERIFICATION      ")
    print("======================================================================")

    db = SessionLocal()
    try:
        # 1. Retrieve key users
        admin_user = db.query(User).filter_by(username="admin").first()
        dev_leader = db.query(User).filter_by(username="dev_leader").first()
        dev_user = db.query(User).filter_by(username="dev_user").first()

        if not admin_user or not dev_leader or not dev_user:
            print("❌ Setup Error: Could not locate test users.")
            sys.exit(1)

        print(f"✅ Loaded Users: Admin ({admin_user.username}), Leader ({dev_leader.username}), Member ({dev_user.username})")

        # 2. Retrieve key projects and phases
        test_project = db.query(Project).first()
        if not test_project:
            print("❌ Setup Error: No project found in database.")
            sys.exit(1)
            
        print(f"ℹ️ Using test project: {test_project.id} - '{test_project.title}'")

        # Ensure dev_leader is the project lead, and project is not completed/deployed for task creation tests
        original_lead_id = test_project.project_lead_id
        original_status = test_project.status
        original_is_deployed = test_project.is_deployed

        test_project.project_lead_id = dev_leader.id
        test_project.status = "in_progress"
        test_project.is_deployed = 0
        db.commit()

        # Clean up any pre-existing membership
        db.query(ProjectMember).filter_by(project_id=test_project.id, user_id=dev_user.id).delete()
        db.commit()

        # Clear any tasks created during this test
        db.query(Task).filter(Task.title.in_([
            "Unassigned Project Test Task",
            "Restricted Phase Test Task",
            "Allowed Phase Test Task",
            "Acceptance Self Test Task",
            "Acceptance Leader Test Task"
        ])).delete()
        db.commit()

        # --- Test 1: Block task creation on project if member is not assigned ---
        print("\nTest 1: Member attempting to create task on unassigned project...")
        try:
            create_task(
                body={
                    "project_id": test_project.id,
                    "title": "Unassigned Project Test Task",
                    "assignee_id": dev_user.id,
                    "team_id": 2,
                    "crisp_dm_phase": "Business Understanding"
                },
                user_id=dev_user.id,
                db=db
            )
            print("  ❌ Failed: Member successfully created task on unassigned project!")
            sys.exit(1)
        except HTTPException as he:
            if he.status_code == 403 and "not assigned to this project" in he.detail:
                print(f"  ✅ Passed: Correctly blocked with {he.status_code} - '{he.detail}'")
            else:
                print(f"  ❌ Failed: Got unexpected error: {he.status_code} - '{he.detail}'")
                sys.exit(1)

        # --- Test 2: Project Lead manages project members ---
        print("\nTest 2a: Non-lead/Non-admin member attempting to set project members...")
        try:
            set_project_members(
                project_id=test_project.id,
                body={
                    "members": [
                        {"user_id": dev_user.id, "assigned_phases": ["Business Understanding"]}
                    ]
                },
                user_id=dev_user.id,
                db=db
            )
            print("  ❌ Failed: Non-lead member successfully updated project members!")
            sys.exit(1)
        except HTTPException as he:
            if he.status_code == 403 and "manage project members" in he.detail:
                print(f"  ✅ Passed: Correctly blocked with {he.status_code} - '{he.detail}'")
            else:
                print(f"  ❌ Failed: Got unexpected error: {he.status_code} - '{he.detail}'")
                sys.exit(1)

        print("Test 2b: Project Lead assigning member to project restricted to 'Business Understanding' phase...")
        try:
            set_project_members(
                project_id=test_project.id,
                body={
                    "members": [
                        {"user_id": dev_user.id, "assigned_phases": ["Business Understanding"]}
                    ]
                },
                user_id=dev_leader.id,
                db=db
            )
            pm = db.query(ProjectMember).filter_by(project_id=test_project.id, user_id=dev_user.id).first()
            if pm and pm.assigned_phases == "Business Understanding":
                print("  ✅ Passed: Project Lead successfully configured members.")
            else:
                print("  ❌ Failed: Member configuration was not saved properly in DB.")
                sys.exit(1)
        except Exception as e:
            print(f"  ❌ Failed: Project Lead set members threw error: {e}")
            sys.exit(1)

        # --- Test 3: Block task creation on project if member is assigned but to a different phase ---
        # Let's find an active phase name other than 'Business Understanding'
        non_bu_phase = db.query(Phase).filter(Phase.name != "Business Understanding", Phase.is_active == 1).first()
        non_bu_phase_name = non_bu_phase.name if non_bu_phase else "Data Understanding"

        print(f"\nTest 3: Member attempting to create task in restricted phase '{non_bu_phase_name}'...")
        try:
            create_task(
                body={
                    "project_id": test_project.id,
                    "title": "Restricted Phase Test Task",
                    "assignee_id": dev_user.id,
                    "team_id": 2,
                    "crisp_dm_phase": non_bu_phase_name
                },
                user_id=dev_user.id,
                db=db
            )
            print("  ❌ Failed: Member successfully created task in restricted phase!")
            sys.exit(1)
        except HTTPException as he:
            if he.status_code == 403 and "not assigned to phase" in he.detail:
                print(f"  ✅ Passed: Correctly blocked with {he.status_code} - '{he.detail}'")
            else:
                print(f"  ❌ Failed: Got unexpected error: {he.status_code} - '{he.detail}'")
                sys.exit(1)

        # --- Test 4: Success when member creates task in allowed phase ---
        print("\nTest 4: Member creating task in allowed phase 'Business Understanding'...")
        try:
            new_task = create_task(
                body={
                    "project_id": test_project.id,
                    "title": "Allowed Phase Test Task",
                    "assignee_id": dev_user.id,
                    "team_id": 2,
                    "crisp_dm_phase": "Business Understanding"
                },
                user_id=dev_user.id,
                db=db
            )
            # Fetch from DB to confirm creation
            db_task = db.query(Task).filter_by(title="Allowed Phase Test Task").first()
            if db_task and db_task.assignee_id == dev_user.id:
                print("  ✅ Passed: Member successfully created task in allowed phase.")
            else:
                print("  ❌ Failed: Task was not saved or assignee mismatched.")
                sys.exit(1)
        except Exception as e:
            print(f"  ❌ Failed: Task creation in allowed phase threw error: {e}")
            sys.exit(1)

        # --- Test 5: Allow all phases if member is assigned to project but with empty phase list ---
        print("\nTest 5a: Project Lead updating member to have access to ALL phases (empty assigned_phases list)...")
        set_project_members(
            project_id=test_project.id,
            body={
                "members": [
                    {"user_id": dev_user.id, "assigned_phases": []}
                ]
            },
            user_id=dev_leader.id,
            db=db
        )
        pm = db.query(ProjectMember).filter_by(project_id=test_project.id, user_id=dev_user.id).first()
        if pm and pm.assigned_phases is None:
            print("  ✅ Passed: Project Lead cleared phase restrictions.")
        else:
            print("  ❌ Failed: Phases list did not clear correctly in DB.")
            sys.exit(1)

        print(f"Test 5b: Member creating task in phase '{non_bu_phase_name}' now that restrictions are cleared...")
        try:
            unrestricted_task = create_task(
                body={
                    "project_id": test_project.id,
                    "title": "Restricted Phase Test Task",
                    "assignee_id": dev_user.id,
                    "team_id": 2,
                    "crisp_dm_phase": non_bu_phase_name
                },
                user_id=dev_user.id,
                db=db
            )
            print("  ✅ Passed: Member successfully created task in previously restricted phase.")
        except Exception as e:
            print(f"  ❌ Failed: Task creation with cleared restrictions threw error: {e}")
            sys.exit(1)

        # --- Test 6: Task acceptance limits ---
        # Create a task assigned to dev_user (with pending acceptance)
        assigned_to_me = Task(
            project_id=test_project.id,
            title="Acceptance Self Test Task",
            status="todo",
            assignee_id=dev_user.id,
            created_by_id=dev_leader.id,
            team_id=2,
            phase_id=1,
            acceptance_status="pending_acceptance"
        )
        # Create a task assigned to dev_leader
        assigned_to_leader = Task(
            project_id=test_project.id,
            title="Acceptance Leader Test Task",
            status="todo",
            assignee_id=dev_leader.id,
            created_by_id=dev_leader.id,
            team_id=2,
            phase_id=1,
            acceptance_status="pending_acceptance"
        )
        db.add(assigned_to_me)
        db.add(assigned_to_leader)
        db.commit()

        print("\nTest 6a: Member accepting task assigned to themselves (should succeed)...")
        try:
            update_task(
                task_id=assigned_to_me.id,
                body={
                    "acceptance_status": "accepted",
                    "status": "todo",
                    "assignee": "dev_user"
                },
                user_id=dev_user.id,
                db=db
            )
            db.refresh(assigned_to_me)
            if assigned_to_me.acceptance_status == "accepted":
                print("  ✅ Passed: Member successfully accepted task assigned to themselves.")
            else:
                print("  ❌ Failed: Task status did not update to accepted.")
                sys.exit(1)
        except Exception as e:
            print(f"  ❌ Failed: Task acceptance by assignee threw error: {e}")
            sys.exit(1)

        print("Test 6b: Member attempting to accept task assigned to someone else (should fail)...")
        try:
            update_task(
                task_id=assigned_to_leader.id,
                body={
                    "acceptance_status": "accepted",
                    "status": "todo",
                    "assignee": "dev_leader"
                },
                user_id=dev_user.id,
                db=db
            )
            print("  ❌ Failed: Member accepted a task assigned to someone else!")
            sys.exit(1)
        except HTTPException as he:
            if he.status_code == 403 and "designated Project Lead" in he.detail:
                print(f"  ✅ Passed: Correctly blocked with {he.status_code} - '{he.detail}'")
            else:
                print(f"  ❌ Failed: Got unexpected error: {he.status_code} - '{he.detail}'")
                sys.exit(1)

        # --- Cleanup ---
        db.query(Task).filter(Task.title.in_([
            "Unassigned Project Test Task",
            "Restricted Phase Test Task",
            "Allowed Phase Test Task",
            "Acceptance Self Test Task",
            "Acceptance Leader Test Task"
        ])).delete()
        db.query(ProjectMember).filter_by(project_id=test_project.id, user_id=dev_user.id).delete()
        test_project.project_lead_id = original_lead_id
        test_project.status = original_status
        test_project.is_deployed = original_is_deployed
        db.commit()
        print("\n✅ Cleanup of test data completed successfully.")

        print("======================================================================")
        print("   ALL PROJECT MEMBERSHIP & PHASE WRITE BOUNDARIES VERIFICATIONS PASSED!  ")
        print("======================================================================")

    except Exception as e:
        print(f"❌ Verification failed with error: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    run_project_members_security_verification()
