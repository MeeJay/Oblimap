import { MapPin } from 'lucide-react';

export function SitesPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <MapPin size={24} className="text-accent" />
        <h1 className="text-2xl font-semibold text-text-primary">Sites</h1>
      </div>
      <div className="text-text-secondary text-sm">
        IPAM sites management coming in Phase 3.
      </div>
    </div>
  );
}
