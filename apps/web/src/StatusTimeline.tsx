import { jobStatuses, type JobStatus } from '@attestlock/shared';

const flow = jobStatuses.slice(0, 6);

export function StatusTimeline({ status }: { status: JobStatus }) {
  const terminalFailure = status === 'refused' || status === 'failed';
  const activeIndex = terminalFailure ? flow.length - 1 : flow.indexOf(status);
  return (
    <ol className="timeline" aria-label="Proof job progress">
      {flow.map((step, index) => {
        const reached = index <= activeIndex;
        const current = terminalFailure ? index === flow.length - 1 : step === status;
        return (
          <li key={step} className={reached ? 'reached' : ''} aria-current={current ? 'step' : undefined}>
            <span className="timeline-dot" aria-hidden="true" />
            <span>{step.replaceAll('_', ' ')}</span>
          </li>
        );
      })}
      {terminalFailure && (
        <li className={status}>
          <span className="timeline-dot" aria-hidden="true" />
          <span>{status}</span>
        </li>
      )}
    </ol>
  );
}
