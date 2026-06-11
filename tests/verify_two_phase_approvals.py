import sys
import os
from fastapi import HTTPException

# Adjust path to import backend and models
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import SessionLocal
from models import User, Task, Project, Team, Role, ProjectMember, UserTeam
from backend import update_task, delete_task, create_task, lead_approve_task, team_lead_approve_task, team_lead_reject_task

def run_approval_verification():
    print("======================================================================")
    print("      TWO-STAGE TASK APPROVAL WORKFLOW VERIFICATION                  ")
    print("======================================================================")

    db = SessionLocal()
    try:
        # 1. Load users
        admin_user = db.query(User).filter_by(username="admin").first()
        dev_leader = db.query(User).filter_by(username="dev_leader").first()
        dev_user = db.query(User).filter_by(username="dev_user").first()

        if not admin_user or not dev_leader or not dev_user:
            print("❌ Setup Error: Could not locate test users.")
            sys.exit(1)

        print(f"Loaded Users: Admin ({admin_user.username}), Team Lead ({dev_leader.username}), Member ({dev_user.username})")

        # 2. Setup a test project where Project Lead is Admin, so it is different from Team Lead
        test_project_id = "TEST-APPROVAL-PROJ"
        # Cleanup if exists
        db.query(Task).filter(Task.project_id == test_project_id).delete()
        db.query(ProjectMember).filter(ProjectMember.project_id == test_project_id).delete()
        db.query(Project).filter_by(id=test_project_id).delete()
        db.commit()

        test_project = Project(
            id=test_project_id,
            title="Test Approval Project",
            project_lead_id=admin_user.id,
            team_id=2, # Development Team
            phase_id=1
        )
        db.add(test_project)
        db.commit()
        
        # Add dev_user to the project members
        db.add(ProjectMember(project_id=test_project_id, user_id=dev_user.id, assigned_phases=None))
        db.commit()

        print(f"Created test project '{test_project_id}' with Project Lead as Admin.")

        # --- TEST 1: Member self-assignment goes to pending_lead_approval ---
        print("\nTest 1: Member self-assigns task...")
        task_data = {
            "project_id": test_project_id,
            "title": "Self-Assigned Test Task",
            "description": "Test description",
            "assignee_id": dev_user.id,
            "team_id": 2, # Dev Team
            "status": "todo"
        }
        
        # We simulate member creating task via create_task function
        task_res = create_task(body=task_data, user_id=dev_user.id, db=db)
        # Fetch the created task
        created_task = db.query(Task).filter_by(project_id=test_project_id, title="Self-Assigned Test Task").first()
        if not created_task:
            print("❌ Failed: Task was not created.")
            sys.exit(1)
            
        print(f"  Task created with approval_status: '{created_task.approval_status}'")
        assert created_task.approval_status == 'pending_lead_approval', f"Expected pending_lead_approval, got {created_task.approval_status}"
        print("  ✅ Passed: Self-assigned task correctly set to pending_lead_approval.")

        # --- TEST 2: Assignee read-only constraints ---
        print("\nTest 2: Assignee attempting to update task in pending approval state...")
        try:
            update_task(
                task_id=created_task.id,
                body={"status": "in_progress"},
                user_id=dev_user.id,
                db=db
            )
            print("  ❌ Failed: Assignee was allowed to update a task in pending approval state.")
            sys.exit(1)
        except HTTPException as he:
            if he.status_code == 403 and "is pending approval and is read-only" in he.detail:
                print(f"  ✅ Passed: Correctly blocked update with {he.status_code} - '{he.detail}'")
            else:
                print(f"  ❌ Failed: Blocked but with wrong error: {he.status_code} - '{he.detail}'")
                sys.exit(1)

        # --- TEST 3: Project Lead approval transitions task to pending_team_lead_approval ---
        print("\nTest 3: Project Lead (Admin) approving the task...")
        lead_approve_task(task_id=created_task.id, user_id=admin_user.id, db=db)
        db.refresh(created_task)
        print(f"  Task approval_status after Project Lead approval: '{created_task.approval_status}'")
        assert created_task.approval_status == 'pending_team_lead_approval', f"Expected pending_team_lead_approval, got {created_task.approval_status}"
        print("  ✅ Passed: Project Lead approval successfully transitioned task to pending_team_lead_approval.")

        # --- TEST 4: Team Lead approval transitions task to approved ---
        print("\nTest 4: Team Lead (dev_leader) approving the task...")
        team_lead_approve_task(task_id=created_task.id, user_id=dev_leader.id, db=db)
        db.refresh(created_task)
        print(f"  Task approval_status after Team Lead approval: '{created_task.approval_status}'")
        assert created_task.approval_status == 'approved', f"Expected approved, got {created_task.approval_status}"
        print("  ✅ Passed: Team Lead approval successfully transitioned task to approved.")

        # --- TEST 5: Rejected state and not locked ---
        print("\nTest 5: Reject task scenario...")
        # Create another task
        task_data_2 = {
            "project_id": test_project_id,
            "title": "Task to be rejected",
            "description": "Reject test description",
            "assignee_id": dev_user.id,
            "team_id": 2,
            "status": "todo"
        }
        create_task(body=task_data_2, user_id=dev_user.id, db=db)
        rejected_task = db.query(Task).filter_by(project_id=test_project_id, title="Task to be rejected").first()
        
        # Approve as Project Lead (Admin)
        lead_approve_task(task_id=rejected_task.id, user_id=admin_user.id, db=db)
        db.refresh(rejected_task)
        assert rejected_task.approval_status == 'pending_team_lead_approval'
        
        # Reject as Team Lead
        team_lead_reject_task(task_id=rejected_task.id, body={"reason": "Incorrect description"}, user_id=dev_leader.id, db=db)
        db.refresh(rejected_task)
        print(f"  Task approval_status after Team Lead rejection: '{rejected_task.approval_status}'")
        assert rejected_task.approval_status == 'rejected', f"Expected rejected, got {rejected_task.approval_status}"
        
        # Check that assignee can edit/update it when rejected (i.e. not locked)
        print("  Assignee attempting to update rejected task status to in_progress...")
        update_task(
            task_id=rejected_task.id,
            body={"status": "in_progress"},
            user_id=dev_user.id,
            db=db
        )
        db.refresh(rejected_task)
        assert rejected_task.status == "in_progress"
        print("  ✅ Passed: Rejected tasks remain assignable and are not locked.")

        # --- CLEANUP ---
        db.query(Task).filter(Task.project_id == test_project_id).delete()
        db.query(ProjectMember).filter(ProjectMember.project_id == test_project_id).delete()
        db.query(Project).filter_by(id=test_project_id).delete()
        db.commit()
        print("\n✅ Cleanup of temporary test projects and tasks completed.")

        print("======================================================================")
        print("    ALL TWO-STAGE APPROVAL WORKFLOW VERIFICATIONS PASSED!             ")
        print("======================================================================")

    except Exception as e:
        print(f"❌ Verification failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    run_approval_verification()
