interface Step {
  label: string;
  completed: boolean;
}

interface ProgressBarProps {
  steps: Step[];
  currentStep?: number;
}

export default function ProgressBar({ steps, currentStep }: ProgressBarProps) {
  const completedCount = steps.filter(s => s.completed).length;
  const activeIdx = currentStep ?? completedCount;

  return (
    <div className="flex items-center gap-0 w-full">
      {steps.map((step, idx) => {
        const isDone   = step.completed;
        const isActive = idx === activeIdx;
        const isLast   = idx === steps.length - 1;

        return (
          <div key={idx} className="flex items-center flex-1">
            {/* Node */}
            <div className="flex flex-col items-center gap-2 w-full relative group">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all duration-500 z-10 bg-background ${
                  isDone
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : isActive
                    ? 'border-primary text-primary shadow-sm shadow-primary/10'
                    : 'border-border text-muted-foreground bg-secondary'
                }`}
              >
                {isDone ? (
                  <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>

              {/* Label */}
              <div className="absolute top-10 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <span className={`text-[11px] font-medium whitespace-nowrap transition-colors ${
                  isDone ? 'text-primary' : isActive ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {step.label}
                </span>
              </div>
            </div>

            {/* Connector */}
            {!isLast && (
              <div className="w-full h-1 mx-2 -ml-2 rounded-full overflow-hidden bg-secondary relative z-0">
                <div
                  className="absolute top-0 left-0 h-full bg-primary transition-all duration-700 ease-in-out"
                  style={{ width: isDone ? '100%' : '0%' }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
