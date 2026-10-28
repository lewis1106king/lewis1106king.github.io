import {
  activeTask,
  applyCommand,
  createWorkflow,
  csvHistory,
  latestReview,
  latestTask,
  projectZones,
  validateWorkflow,
} from './workflow';

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function ok(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function throws(run: () => unknown, fragment: string, message: string): void {
  try {
    run();
  } catch (error) {
    ok(error instanceof Error && error.message.includes(fragment), `${message}: ${String(error)}`);
    return;
  }
  throw new Error(`${message}: 오류가 발생하지 않았습니다.`);
}

// 초기 fixture: data.ts의 10개 작업, 11/12의 작업 없음, 08 사유/메모 분리
const initial = createWorkflow();
equal(initial.version, 2, '워크플로 버전');
equal(initial.revision, 0, '초기 리비전');
equal(initial.tasks.length, 10, '초기 작업 수');
equal(latestTask(initial, 'Z-11'), undefined, 'Z-11은 미배정');
equal(latestTask(initial, 'Z-12'), undefined, 'Z-12는 미배정');
equal(latestTask(initial, 'Z-07')?.status, 'in_progress', 'Z-07 초기 상태');
equal(latestTask(initial, 'Z-08')?.status, 'assigned', 'Z-08 초기 상태');
equal(latestReview(initial, 'Z-08')?.reason, '시야 가림으로 재확인 요청', '08 기존 메모를 검토 사유로 명시 매핑');
equal(initial.materials.find((material) => material.zoneId === 'Z-08')?.memo, '시야 가림으로 재확인 요청', '08 자료 메모 보존');
ok(validateWorkflow(initial), '초기 상태는 유효해야 함');
equal(projectZones(initial).length, 12, '12개 구역 projection');
equal(projectZones(initial).find((zone) => zone.id === 'Z-08')?.observationStatus, 'recheck', 'projection 관측 상태');

// 최초 배정과 상태 전이, 원본 불변성
const initialSnapshot = JSON.stringify(initial);
const assigned = applyCommand(initial, { type: 'assign', zoneId: 'Z-11', droneId: 'A', reason: '초기 배정', expectedRevision: 0 });
equal(JSON.stringify(initial), initialSnapshot, '명령은 원본 상태를 변경하지 않음');
equal(assigned.revision, 1, '최초 배정 리비전 증가');
equal(activeTask(assigned, 'Z-11')?.status, 'assigned', 'Z-11 배정 상태');
const z11TaskId = activeTask(assigned, 'Z-11')?.id;
ok(z11TaskId, 'Z-11 task id 필요');
const started = applyCommand(assigned, { type: 'taskStatus', taskId: z11TaskId, status: 'in_progress', reason: '작업 시작', expectedRevision: 1 });
const completed = applyCommand(started, { type: 'taskStatus', taskId: z11TaskId, status: 'completed', reason: '작업 완료', expectedRevision: 2 });
equal(latestTask(completed, 'Z-11')?.status, 'completed', '완료 상태');
const corrected = applyCommand(completed, { type: 'correctCompletion', taskId: z11TaskId, reason: '완료 기록 정정', expectedRevision: 3 });
equal(latestTask(corrected, 'Z-11')?.status, 'assigned', '완료 정정 상태');

// B 중단은 07/08의 활성 작업만 중단하며 관측 상태는 독립적으로 유지
const bInterrupted = applyCommand(createWorkflow(), { type: 'interruptB', expectedRevision: 0 });
equal(bInterrupted.bInterrupted, true, 'B 중단 플래그');
equal(latestTask(bInterrupted, 'Z-05')?.status, 'completed', '완료 B05 보존');
equal(latestTask(bInterrupted, 'Z-06')?.status, 'completed', '완료 B06 보존');
equal(latestTask(bInterrupted, 'Z-07')?.status, 'interrupted', 'B07 중단');
equal(latestTask(bInterrupted, 'Z-08')?.status, 'interrupted', 'B08 중단');
equal(latestReview(bInterrupted, 'Z-08')?.status, 'recheck', '작업 중단이 검토 상태를 변경하지 않음');
equal(latestReview(bInterrupted, 'Z-08')?.reason, '시야 가림으로 재확인 요청', '08 검토 사유 보존');

// 일반 중단 + 인계: 원본 task와 자료 ownership 보존, 새 assigned task 생성
const sourceInitial = createWorkflow();
const sourceId = latestTask(sourceInitial, 'Z-07')?.id;
ok(sourceId, 'Z-07 source task 필요');
const withMaterial = applyCommand(sourceInitial, { type: 'material', zoneId: 'Z-07', label: '인계 전 자료', memo: '원본에 귀속', expectedRevision: 0 });
const originalMaterial = withMaterial.materials.find((material) => material.label === '인계 전 자료');
ok(originalMaterial, '인계 전 자료 생성');
equal(originalMaterial.taskId, sourceId, '자료는 인계 전 원본 작업에 귀속');
const interrupted = applyCommand(withMaterial, { type: 'interrupt', taskId: sourceId, reason: '배터리 점검 필요', expectedRevision: 1 });
const handedOver = applyCommand(interrupted, { type: 'handover', taskId: sourceId, droneId: 'C', reason: '운영자 승인', requestId: 'handover-request-07', expectedRevision: 2 });
equal(handedOver.tasks.length, interrupted.tasks.length + 1, '새 assigned task가 추가됨');
equal(handedOver.handovers.length, 1, '인계 기록 생성');
equal(handedOver.handovers[0].interruptionReason, '배터리 점검 필요', '원본 중단 사유 보존');
equal(handedOver.handovers[0].approvalReason, '운영자 승인', '인계 승인 사유 분리');
equal(latestTask(handedOver, 'Z-07')?.status, 'assigned', '인계 새 작업은 배정 상태');
equal(latestTask(handedOver, 'Z-07')?.previousTaskId, sourceId, '새 작업은 원본을 참조');
equal(handedOver.materials.find((material) => material.label === '인계 전 자료')?.taskId, sourceId, '기존 자료는 인계 뒤에도 원본 소유');
equal(projectZones(handedOver).find((zone) => zone.id === 'Z-07')?.handover?.to, 'C', 'projection 인계 표시');

// 같은 source+requestId+payload의 stale 재시도는 멱등, 대상 변경은 거부
const duplicate = applyCommand(handedOver, { type: 'handover', taskId: sourceId, droneId: 'C', reason: '운영자 승인', requestId: 'handover-request-07', expectedRevision: 0 });
equal(duplicate, handedOver, '동일 인계 재시도는 기존 상태를 반환');
throws(
  () => applyCommand(handedOver, { type: 'handover', taskId: sourceId, droneId: 'A', reason: '운영자 승인', requestId: 'handover-request-07', expectedRevision: 0 }),
  '중복 인계 요청',
  '동일 requestId의 대상 변경 거부',
);
throws(
  () => applyCommand(handedOver, { type: 'review', zoneId: 'Z-01', status: 'confirmed', reason: '낡은 쓰기', expectedRevision: 0 }),
  '버전 충돌',
  '일반 stale revision 거부',
);

// 검토는 task를 건드리지 않고 unverified로도 되돌릴 수 있음
const reviewBefore = latestTask(handedOver, 'Z-07');
const reviewed = applyCommand(handedOver, { type: 'review', zoneId: 'Z-07', status: 'unverified', reason: '검토 재개', expectedRevision: handedOver.revision });
equal(latestReview(reviewed, 'Z-07')?.status, 'unverified', '검토 상태 되돌리기');
equal(JSON.stringify(latestTask(reviewed, 'Z-07')), JSON.stringify(reviewBefore), '검토가 작업을 변경하지 않음');

// 저장 corruption: nested material reference가 바뀌면 거부
const corrupt = createWorkflow();
corrupt.materials[0].taskId = '없는-작업';
equal(validateWorkflow(corrupt), false, '잘못된 material task reference 거부');

// CSV: BOM, 모든 셀 인용/따옴표 escape, formula injection 차단
const formulaState = applyCommand(createWorkflow(), { type: 'review', zoneId: 'Z-01', status: 'confirmed', reason: '=SUM(1,1) "주입"', expectedRevision: 0 });
const csv = csvHistory(formulaState);
ok(csv.startsWith('\uFEFF"id","time"'), 'CSV BOM과 인용 헤더');
ok(csv.includes('"\'=SUM(1,1) ""주입"""'), 'CSV 수식 차단 및 따옴표 escape');
ok(csv.includes('"before"') && csv.includes('"after"'), 'CSV에 모든 audit 필드 포함');

console.log('workflow tests passed');

// 인계 후 실제 다음 조작과 재접속 검증: 새 작업은 assigned로 시작하지만 이후 상태 전이를 허용한다.
const replacementId = latestTask(handedOver, 'Z-07')!.id;
const replacementStarted = applyCommand(handedOver, { type: 'taskStatus', taskId: replacementId, status: 'in_progress', reason: '인계받은 수색 시작', expectedRevision: handedOver.revision });
ok(validateWorkflow(replacementStarted), '인계받은 작업 시작 후 저장본 유효');
const replacementDone = applyCommand(replacementStarted, { type: 'taskStatus', taskId: replacementId, status: 'completed', reason: '작업 수행 완료', expectedRevision: replacementStarted.revision });
ok(validateWorkflow(JSON.parse(JSON.stringify(replacementDone))), '인계 작업 완료 후 재접속 상태 유효');
equal(latestReview(replacementDone, 'Z-07')?.status, 'unverified', '작업 완료가 관측을 확정하지 않음');
const replacementCorrected = applyCommand(replacementDone, { type: 'correctCompletion', taskId: replacementId, reason: '완료 오입력 정정', expectedRevision: replacementDone.revision });
ok(validateWorkflow(replacementCorrected), '인계 작업 정정 후 유효');
const againInterrupted = applyCommand(replacementCorrected, { type: 'interrupt', taskId: replacementId, reason: '추가 수색 필요', expectedRevision: replacementCorrected.revision });
const againHandedOver = applyCommand(againInterrupted, { type: 'handover', taskId: replacementId, droneId: 'A', reason: '두 번째 인계 검토', requestId: 'second-handover', expectedRevision: againInterrupted.revision });
equal(againHandedOver.handovers.length, 2, '재인계도 새 작업과 별도 인계 기록');
ok(validateWorkflow(againHandedOver), '연속 인계 체인 유효');
equal(againHandedOver.materials.length, handedOver.materials.length, '재인계에서도 파일/자료 복제 없음');
equal(againHandedOver.tasks.find(t => t.id === sourceId)?.interruptionReason, '배터리 점검 필요', '첫 중단 사유 유지');

// 기준 시나리오 07->A/08->C와 두 완료·미배정 구역 보존
const initialInvariant = createWorkflow();
const exactInterrupted = applyCommand(initialInvariant, { type: 'interruptB', expectedRevision: 0 });
let exactHandedOver = applyCommand(exactInterrupted, { type: 'handover', taskId: latestTask(exactInterrupted, 'Z-07')!.id, droneId: 'A', reason: '07 인계 승인', requestId: 'exact07', expectedRevision: exactInterrupted.revision });
exactHandedOver = applyCommand(exactHandedOver, { type: 'handover', taskId: latestTask(exactHandedOver, 'Z-08')!.id, droneId: 'C', reason: '08 인계 승인', requestId: 'exact08', expectedRevision: exactHandedOver.revision });
equal(activeTask(exactHandedOver, 'Z-07')?.droneId, 'A', '07 A 담당');
equal(activeTask(exactHandedOver, 'Z-08')?.droneId, 'C', '08 C 담당');
equal(latestReview(exactHandedOver, 'Z-08')?.reason, '시야 가림으로 재확인 요청', '인계 뒤에도 재확인 사유 유지');
for (const zoneId of ['Z-05', 'Z-06', 'Z-11', 'Z-12']) {
  equal(JSON.stringify(latestTask(exactHandedOver, zoneId)), JSON.stringify(latestTask(initialInvariant, zoneId)), `${zoneId} 작업 불변`);
}
equal(projectZones(exactHandedOver).filter(z => z.needsHandover).length, 0, '인계 후 대기 없음');
equal(JSON.stringify(initialInvariant), JSON.stringify(createWorkflow()), '초기 fixture 불변');
const correctedB = applyCommand(exactHandedOver, { type: 'correctCompletion', taskId: latestTask(exactHandedOver, 'Z-05')!.id, reason: '운영자가 명시적으로 완료 오입력 정정', expectedRevision: exactHandedOver.revision });
ok(validateWorkflow(correctedB), '시연 플래그를 실제 기체 고장으로 간주하지 않음');
console.log('workflow extended regressions passed');

const b11 = applyCommand(createWorkflow(), { type: 'assign', zoneId: 'Z-11', droneId: 'B', reason: '독립 미배정 구역', expectedRevision: 0 });
const b11Interrupted = applyCommand(b11, { type: 'interruptB', expectedRevision: b11.revision });
equal(latestTask(b11Interrupted, 'Z-11')?.status, 'assigned', 'B07/08 시연이 B11을 중단하지 않음');
ok(validateWorkflow(b11Interrupted), '시연은 다른 B 작업에 임의의 제한을 추가하지 않음');
console.log('scoped B demo regression passed');
