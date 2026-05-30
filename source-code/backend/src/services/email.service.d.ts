export declare function sendEmail(options: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  data?: any;
}): Promise<void>;