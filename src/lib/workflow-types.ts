export const workflowFieldTypes = [
  "CHECKBOX",
  "TEXT_INPUT",
  "PHOTO_UPLOAD",
  "SIGNATURE",
] as const;

export const jobTypes = [
  "INSTALLATION",
  "MAINTENANCE",
  "SURVEY",
  "REPAIR",
] as const;

export type JobType = (typeof jobTypes)[number];
export type WorkflowFieldType = (typeof workflowFieldTypes)[number];

export type WorkflowFormField = {
  id: string;
  label: string;
  type: WorkflowFieldType;
  isRequired: boolean;
};

export type WorkflowStageInput = {
  id?: string;
  stageName: string;
  isMandatory: boolean;
  formSchema: WorkflowFormField[];
};
