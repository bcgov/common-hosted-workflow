import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface SignedOutViewProps {
  onSignIn: () => void;
}

function SignedOutView({ onSignIn }: Readonly<SignedOutViewProps>) {
  return (
    <Card>
      <CardContent className="space-y-5 p-6 sm:p-8">
        <div className="space-y-2">
          <h2 className="text-xl font-bold leading-7 text-foreground">Sign in to continue</h2>
          <p className="text-base leading-6 text-muted-foreground">
            Sign in with your IDIR account to view workflows shared with you.
          </p>
        </div>

        <div>
          <Button type="button" onClick={onSignIn}>
            Sign in
          </Button>
        </div>

        <hr className="border-border" />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{`Can't sign in with your IDIR account?`}</span>
          <Button type="button" variant="ghost" size="sm" asChild>
            <a href="https://bcgov.github.io/sso-docs/category/frequently-asked-questions">Get help</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { SignedOutView };
