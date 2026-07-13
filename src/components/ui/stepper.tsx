import * as React from "react"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export interface StepperStep {
  key: string
  label: string
  done: boolean
  at?: string | null
}

function Stepper({
  steps,
  className,
}: {
  steps: StepperStep[]
  className?: string
}) {
  const lastDoneIndex = steps.reduce((acc, s, i) => (s.done ? i : acc), -1)

  return (
    <div data-slot="stepper" className={cn("flex flex-col", className)}>
      {steps.map((step, i) => {
        const isCurrent = i === lastDoneIndex + 1
        return (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  step.done
                    ? "bg-primary border-primary text-primary-foreground"
                    : isCurrent
                    ? "border-primary text-primary"
                    : "border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {step.done ? <CheckIcon className="size-3.5" /> : i + 1}
              </span>
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    "w-px flex-1 min-h-6",
                    step.done ? "bg-primary" : "bg-muted-foreground/20"
                  )}
                />
              )}
            </div>
            <div className="pb-6">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.done || isCurrent ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
              {step.at && (
                <p className="text-xs text-muted-foreground">
                  {new Date(step.at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export { Stepper }
