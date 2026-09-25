import { SiteLogoHorizontal } from "@/components/SiteLogo";

export function MaintenancePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <SiteLogoHorizontal />
      <h1 className="font-serif text-4xl sm:text-5xl font-bold text-primary">Closed for Maintenance</h1>
      <p className="max-w-xl text-base sm:text-lg text-muted-foreground">
        TorahForTheTable.com is temporarily unavailable while we perform maintenance. Please check back soon.
      </p>
    </main>
  );
}
