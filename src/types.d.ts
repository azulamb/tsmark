export type TsmarkNodeType = 'heading' | 'paragraph';
export type TsmarkNode = {
  type: 'heading';
  level: number;
  content: string;
} |
{
  type: 'paragraph';
  content: string;
};
