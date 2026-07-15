export function PageHeader({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mb-5 max-w-3xl">
      <h1 className="font-display text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">{title}</h1>
      <p className="mt-2 text-base text-slate-600">{blurb}</p>
    </div>
  );
}
