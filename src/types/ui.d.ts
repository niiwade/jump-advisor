// Type declarations for UI components
declare module '@/components/ui/button' {
  export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
    size?: 'default' | 'sm' | 'lg' | 'icon';
  }
  export const Button: React.ComponentType<ButtonProps>;
}

declare module '@/components/ui/card' {
  export type CardProps = React.HTMLAttributes<HTMLDivElement>;
  export const Card: React.ComponentType<CardProps>;
  
  export type CardContentProps = React.HTMLAttributes<HTMLDivElement>;
  export const CardContent: React.ComponentType<CardContentProps>;
  
  export type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;
  export const CardDescription: React.ComponentType<CardDescriptionProps>;
  
  export type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;
  export const CardFooter: React.ComponentType<CardFooterProps>;
  
  export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;
  export const CardHeader: React.ComponentType<CardHeaderProps>;
  
  export type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;
  export const CardTitle: React.ComponentType<CardTitleProps>;
}

declare module '@/components/ui/badge' {
  export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  }
  export const Badge: React.ComponentType<BadgeProps>;
}

declare module '@/components/ui/input' {
  export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
  export const Input: React.ComponentType<InputProps>;
}

declare module '@/components/ui/switch' {
  export interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }
  export const Switch: React.ComponentType<SwitchProps>;
}

declare module '@/components/ui/label' {
  export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;
  export const Label: React.ComponentType<LabelProps>;
}

declare module '@/components/ui/tabs' {
  export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
  }
  export const Tabs: React.ComponentType<TabsProps>;
  
  export type TabsContentProps = React.HTMLAttributes<HTMLDivElement> & {
    value: string;
  };
  export const TabsContent: React.ComponentType<TabsContentProps>;
  
  export type TabsListProps = React.HTMLAttributes<HTMLDivElement>;
  export const TabsList: React.ComponentType<TabsListProps>;
  
  export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    value: string;
  }
  export const TabsTrigger: React.ComponentType<TabsTriggerProps>;
}

declare module '@/components/ui/progress' {
  export interface ProgressProps {
    value?: number;
    max?: number;
    className?: string;
  }
  export const Progress: React.ComponentType<ProgressProps>;
}

declare module '@/components/ui/use-toast' {
  export interface ToastProps {
    title?: string;
    description?: string;
    action?: React.ReactNode;
    variant?: "default" | "destructive";
  }

  export interface ToastActionElement {
    altText?: string;
    action?: React.ReactNode;
    className?: string;
  }

  export function useToast(): {
    toast: (props: ToastProps) => void;
    dismiss: (toastId?: string) => void;
  };

  export const toast: {
    (props: ToastProps): {
      id: string;
      dismiss: () => void;
      update: (props: ToastProps) => void;
    };
    dismiss: (toastId?: string) => void;
  };
}
