import { IconLogin2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

interface SignedOutViewProps {
  title?: string;
  description: string;
  onSignIn: () => void;
}

function SignedOutView({ title = 'Sign in to continue', description, onSignIn }: Readonly<SignedOutViewProps>) {
  return (
    <section className="mx-auto flex min-h-80 max-w-xl flex-col items-center justify-center px-4 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-information-surface text-information">
        <IconLogin2 className="size-6" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-[2rem] leading-10 font-bold text-foreground">{title}</h1>
      <p className="mt-2 text-sm leading-5 text-muted-foreground">{description}</p>
      <Button type="button" onClick={onSignIn} className="mt-6">
        <IconLogin2 className="size-4" aria-hidden="true" />
        Sign in
      </Button>
    </section>
  );
}

export { SignedOutView };
