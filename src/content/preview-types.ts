export interface PendingPreview {
  actionName: string;
  icon?: string;
  color?: string;
  originalText: string;
  resultText: string;
  fieldSnapshot?: string;
  span: {
    start: number;
    end: number;
    text: string;
    level: string;
  };
}
