import { wizardSteps } from "./tokens";

type WizardStepperProps = {
  currentStep: "config" | "test" | "done";
};

export default function WizardStepper({ currentStep }: WizardStepperProps) {
  const currentIndex = wizardSteps.findIndex((step) => step.id === currentStep);

  return (
    <div className="wizard-stepper" aria-label="配置步骤">
      {wizardSteps.map((step, index) => {
        const isActive = index <= currentIndex;
        return (
          <div className="wizard-step-wrap" key={step.id}>
            <div className="wizard-step">
              <span className={isActive ? "wizard-step-dot active" : "wizard-step-dot"}>
                {step.index}
              </span>
              <span className={isActive ? "wizard-step-label active" : "wizard-step-label"}>
                {step.label}
              </span>
            </div>
            {index < wizardSteps.length - 1 ? <span className="wizard-step-line" /> : null}
          </div>
        );
      })}
    </div>
  );
}
