export type TsmarkNodeType =
  | 'heading'
  | 'paragraph'
  | 'code_block'
  | 'list'
  | 'list_item'
  | 'blockquote'
  | 'thematic_break'
  | 'html';
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
    language?: string;
  }
  | {
    type: 'list';
    ordered: boolean;
    items: TsmarkNode[];
  }
  | {
    type: 'list_item';
    children: TsmarkNode[];
  }
  | {
    type: 'blockquote';
    children: TsmarkNode[];
  }
  | {
    type: 'thematic_break';
  }
  | {
    type: 'html';
    content: string;
  };
