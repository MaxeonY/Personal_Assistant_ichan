export type WizardConfigKey =
  | "notionToken"
  | "todoDbId"
  | "researchDbId"
  | "deepseekApiKey";

export interface SetupStatus {
  completed: boolean;
  configVersion: string | null;
  missingKeys: WizardConfigKey[];
}

export type ValidationErrorCode =
  | "auth_failed"
  | "not_found"
  | "network"
  | "invalid_format"
  | "unknown";

export interface ValidationResult {
  field: WizardConfigKey;
  ok: boolean;
  error?: ValidationErrorCode;
  detail?: string;
}

export interface FirstRunWizardInput {
  notionToken: string;
  todoDbId: string;
  researchDbId: string;
  deepseekApiKey: string;
}

export interface SaveCompleteResult {
  saved: true;
  configVersion: string;
}

export interface FirstRunWizardService {
  checkSetupStatus(): Promise<SetupStatus>;
  validateAll(input: FirstRunWizardInput): Promise<ValidationResult[]>;
  saveAndComplete(input: FirstRunWizardInput): Promise<SaveCompleteResult>;
}

export type FieldValidationState = "empty" | "pending" | "valid" | "invalid";
