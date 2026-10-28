# 정적 시연 개선 공통 인터페이스 (2026-10-28)

서버/인증/실제 파일 미연동. 현재 GitHub Pages를 고치되 미구현을 구현으로 표시하지 않는다. 기존 초기 데이터는 src/data.ts를 사용하고 변경하지 않는다. normalized state 사용, 과거 localStorage v2는 삭제하지 않고 새 key s-question-workflow-v3 사용. 실제 운영 데이터 사용 금지.

## src/workflow.ts exports

기존 types.ts의 DroneId/TaskStatus/ObservationStatus/Zone/HistoryEvent 사용. 기존 파일 수정 안 함. 필요 새 타입은 workflow.ts 내부 export.

Task: { id:string; zoneId:string; droneId:DroneId; status:Exclude<TaskStatus,'unassigned'>; createdAt:string; updatedAt:string; interruptionReason?:string; priorStatus?:TaskStatus; previousTaskId?:string }
Handover: { id:string; zoneId:string; fromTaskId:string; toTaskId:string; from:DroneId; to:DroneId; interruptionReason:string; approvalReason:string; approvedAt:string; actor:string }
Material: {id:string; zoneId:string; taskId:string|null; label:string; reference:string; memo:string; createdAt:string; source:'simulation'}
Review: {id:string; zoneId:string; status:ObservationStatus; reason:string; at:string; actor:string}
Audit: {id:string; time:string; kind:string; message:string; zoneId?:string; taskId?:string; before:unknown; after:unknown; reason:string; actor:string}
WorkflowState: {version:2; revision:number; updatedAt:string; tasks:Task[]; materials:Material[]; reviews:Review[]; handovers:Handover[]; history:Audit[]; bInterrupted:boolean}

createWorkflow(): WorkflowState (from src/data.ts exactly including 08 separate review reason from memo, all 10 initial tasks; 11/12 no task)
projectZones(state): Zone[] (derived projections only, not saved as state. Active assigned/in_progress; no active -> latest task supplies past state/drone display. needsHandover true latest interrupted with no outgoing handover. handover old Zone shape projection allowed for Intro. note ALWAYS status-derived, not old static)
activeTask(state,zoneId):Task|undefined
latestTask(state,zoneId):Task|undefined
latestReview(state,zoneId):Review|undefined
validateWorkflow(value:unknown):value is WorkflowState (nested validation/reference uniqueness/zone IDs/task active unique/from-to handover/material ownership/review/audit/type checks; corrupt storage refuse)

applyCommand(state, command): WorkflowState // throw Error Korean on invalid. pure cloned immutable, version expected default required all. no-op duplicate command returns same state. persist-before-success performed frontend. All mutations single state return with increment revision ISO UTC. actor='시연 운영자'.
Command discriminated union:
{type:'interruptB'; expectedRevision:number}
{type:'assign'; zoneId:string; droneId:DroneId; reason:string; expectedRevision:number}
{type:'taskStatus'; taskId:string; status:'in_progress'|'completed'; reason:string; expectedRevision:number}
{type:'interrupt'; taskId:string; reason:string; expectedRevision:number}
{type:'correctCompletion'; taskId:string; reason:string; expectedRevision:number} // completed->assigned only if no active task; keep history
{type:'review'; zoneId:string; status:ObservationStatus; reason:string; expectedRevision:number}
{type:'material'; zoneId:string; label:string; memo:string; expectedRevision:number} // original latest task (if absent null) materials never rewritten during handover
{type:'handover'; taskId:string; droneId:DroneId; reason:string; requestId:string; expectedRevision:number} // interruption reason retained; old task remains, new id assigned; materials linked by same zone/original task, no cloning; store previousTaskId; dedupe prior handover by source task/request ID even stale expectedRevision. no server claim.

csvHistory(state):string // UTF8 BOM, quoted escaped, prevent CSV formula injection, all audit fields. JSON export done UI JSON.stringify complete state.

All ids globally unique (crypto.randomUUID supported modern browser) with deterministic initializer allowed. Reject empty reasons. B interrupt only assigned/in_progress B07/08, preserve complete05/06; 11/12 unchanged. never change observation status during task mutation. No drone task limit. Include history before+after, independent reasons. review can return to unverified with reason. Completion correction does NOT change review. No archive/cancel fake controls.

## UI scope (src/WorkflowPage.tsx, src/workflow.css)

Default export WorkflowPage({onBack:()=>void}). Main thread will wire App. Import CSS itself. Use above interface. Keep white/#F7F8FA, #142238, #2563EB, #DCE2EA, quiet amber. Actual 3 columns desktop filters/list | grid | selected details with enough font size. small viewport tabs/list not shrink. source=시뮬레이션, last update ISO->KST. Display browser local save status; 서버 미연결/계정 없음/파일 미보관. No fake telemetry/login/upload. localStorage new key; do NOT remove old. Validate before load, malformed data retained with clear warning/new fixture option. Side effect localStorage writes only explicit commits; persist before setState/show success. If saving fails do not apply command; show error. On initial visit no write required. Use revision check against saved value before write; storage listener detect other tab changes and disarm approval; explain cross-tab checks best effort NOT server locking. confirm initial reset in accessible dialog or window.confirm (prefer dialog) preserve old v2 key. reset only demo.

Controls: initial assign for no task, task start/complete, generic interrupt with required reason, completion correction required reason, review reason independent, add text ref only, handover sourceTaskId->newTaskId assigned with required approval reason+review checkbox. latest task cards + all past task/handovers/audit in collapsible tabs. source of material original task visible. 08 review reason visible survives. selected zone dynamic note. Current vs previous assignee distinct. Confirmed does not imply rescued/no person. Entire state JSON export and history CSV. No hidden JSON import feature.

Presentation guide closed initially only demo toolbar. Have B interrupt demo and confirm reset limited to demo. Empty/loading/errors/blocked reasons text. Labels inputs, focus visible, keyboard. User data text React escaped. Long text wraps. Don't invent measured outcomes. Include actual integration status block and data boundary. No additional assets needed.
