export type TsmarkNodeType = 'heading' | 'paragraph' | 'code_block';
export type TsmarkNode =
  | {
    type: 'heading';
    level: number;
    content: string;
  }
  | {
    type: 'paragraph';
    content: string;
  }
  | {
    type: 'code_block';
    content: string;
  };
