import type { OfflineProject } from './model';

export type CheckKind =
  | 'no-evidence'
  | 'review-pending'
  | 'recheck-reason-missing'
  | 'confirmed-metadata-missing'
  | 'unassigned-work'
  | 'completed-with-open-review';

export type CheckIssue = {
  id: string;
  zoneId: string;
  kind: CheckKind;
  title: string;
  message: string;
  severity: 'notice' | 'attention';
};

const issue = (
  zoneId: string,
  kind: CheckKind,
  title: string,
  message: string,
  severity: CheckIssue['severity'],
): CheckIssue => ({ id: `${zoneId}:${kind}`, zoneId, kind, title, message, severity });

/**
 * 점검은 기록 보완을 위한 안내만 반환한다. 어떤 조건도 저장·내보내기를 차단하지 않는다.
 */
export function inspectProject(project: OfflineProject): CheckIssue[] {
  const issues: CheckIssue[] = [];

  for (const zone of project.zones) {
    if (zone.evidence.length === 0) {
      issues.push(issue(
        zone.id,
        'no-evidence',
        '자료 참조 없음',
        `${zone.id}에 연결된 자료 참조가 없습니다.`,
        'attention',
      ));
    }

    if (zone.evidence.length > 0 && zone.observationStatus !== 'confirmed') {
      issues.push(issue(
        zone.id,
        'review-pending',
        '관측 확인 대기',
        `${zone.id}에는 자료가 있으나 관측 상태가 확인 완료가 아닙니다.`,
        'attention',
      ));
    }

    if (zone.observationStatus === 'recheck' && zone.reviewReason.trim().length === 0) {
      issues.push(issue(
        zone.id,
        'recheck-reason-missing',
        '재확인 사유 없음',
        `${zone.id}은 재확인 필요 상태이나 사유가 기록되지 않았습니다.`,
        'notice',
      ));
    }

    if (zone.observationStatus === 'confirmed' && (!zone.confirmedBy || !zone.confirmedAt)) {
      issues.push(issue(
        zone.id,
        'confirmed-metadata-missing',
        '확인 기록 불완전',
        `${zone.id}은 확인 완료 상태이나 확인자 또는 확인 시각이 없습니다.`,
        'attention',
      ));
    }

    if (zone.taskStatus !== 'completed' && zone.droneId === null) {
      issues.push(issue(
        zone.id,
        'unassigned-work',
        '미완료 작업 담당 없음',
        `${zone.id} 작업은 완료되지 않았고 담당 기체도 없습니다.`,
        'attention',
      ));
    }

    if (zone.taskStatus === 'completed' && zone.observationStatus !== 'confirmed') {
      issues.push(issue(
        zone.id,
        'completed-with-open-review',
        '완료 작업의 관측 미확인',
        `${zone.id} 작업은 완료로 기록되었으나 관측 상태가 확인 완료가 아닙니다.`,
        'attention',
      ));
    }
  }

  return issues;
}
