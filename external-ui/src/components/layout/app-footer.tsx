const footerLinks = [
  {
    label: 'Disclaimer',
    href: 'https://www2.gov.bc.ca/gov/content?id=79F93E018712422FBC8E674A67A70535',
  },
  {
    label: 'Privacy',
    href: 'https://www2.gov.bc.ca/gov/content/home/privacy',
  },
  {
    label: 'Accessibility',
    href: 'https://www2.gov.bc.ca/gov/content/home/accessibility',
  },
];

function AppFooter() {
  return (
    <footer className="mt-auto min-h-16 border-t-3 border-accent bg-primary px-4 py-4 text-white">
      <nav
        aria-label="Legal"
        className="mx-auto flex max-w-content flex-wrap items-center justify-center gap-x-7 gap-y-2"
      >
        {footerLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="text-[0.8125rem] font-bold text-white underline-offset-4 hover:text-white hover:underline focus-visible:outline-accent"
          >
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}

export { AppFooter };
