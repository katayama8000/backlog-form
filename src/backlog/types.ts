export const CustomFieldType = {
  Text: 1,
  Sentence: 2,
  Number: 3,
  Date: 4,
  SingleList: 5,
  MultipleList: 6,
  Checkbox: 7,
  Radio: 8,
} as const;

export type Project = { id: number; projectKey: string; name: string };

export type IssueType = { id: number; projectId: number; name: string };

export type ListItem = { id: number; name: string; displayOrder: number };

type CustomFieldBase = {
  id: number;
  projectId: number;
  name: string;
  description: string;
  required: boolean;
  // An empty array means the field applies to every issue type.
  applicableIssueTypes: number[];
};

export type TextField = CustomFieldBase & {
  typeId: typeof CustomFieldType.Text | typeof CustomFieldType.Sentence;
};

export type NumberField = CustomFieldBase & {
  typeId: typeof CustomFieldType.Number;
  min?: number | null;
  max?: number | null;
  unit?: string | null;
};

export type DateField = CustomFieldBase & {
  typeId: typeof CustomFieldType.Date;
  min?: string | null;
  max?: string | null;
};

export type ListField = CustomFieldBase & {
  typeId:
    | typeof CustomFieldType.SingleList
    | typeof CustomFieldType.MultipleList
    | typeof CustomFieldType.Checkbox
    | typeof CustomFieldType.Radio;
  items: ListItem[];
  // Shows an extra free-text "Other" input.
  allowInput?: boolean;
};

export type CustomField = TextField | NumberField | DateField | ListField;

export function isListField(field: CustomField): field is ListField {
  return field.typeId >= CustomFieldType.SingleList;
}

export function isMultiValue(field: CustomField): boolean {
  return (
    field.typeId === CustomFieldType.MultipleList ||
    field.typeId === CustomFieldType.Checkbox
  );
}

export type CreatedIssue = { id: number; issueKey: string };
