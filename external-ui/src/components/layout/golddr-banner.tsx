import { IconAlertTriangle } from '@tabler/icons-react';
import { useIsGoldDr } from '../../state/session';

export function GoldDrBanner() {
  const goldDr = useIsGoldDr();

  if (!goldDr) {
    return null;
  }

  return (
    <output className="block border-b border-warning bg-[#FEF1D8] text-[#2D2D2D]" data-testid="golddr-banner">
      <div className="mx-auto flex w-full max-w-[80rem] items-start gap-3 px-3 py-3 sm:px-6 xl:px-0">
        <IconAlertTriangle size={20} className="mt-[3.5px] shrink-0 text-amber-500" aria-hidden="true" />
        <div className="text-base leading-[27px]">
          <p className="font-bold">Changes you make now won't be kept</p>
          <p>
            The portal is running on its disaster-recovery site. Anything you create or change will be lost when service
            returns to the primary site.
          </p>
        </div>
      </div>
    </output>
  );
}
