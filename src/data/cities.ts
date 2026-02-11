/**
 * Target cities for areazine city pages.
 * These 15 cities have existing GSC signals from the old areazine.com domain.
 * FIPS codes match Census Bureau / CDC PLACES / CMS data.
 */

export interface CityDef {
  name: string;
  slug: string;
  state: string;
  stateCode: string;
  stateFIPS: string;
  countyFIPS: string;
  countyName: string;
  lat: number;
  lng: number;
}

export const CITIES: CityDef[] = [
  { name: 'Charlotte', slug: 'charlotte', state: 'North Carolina', stateCode: 'NC', stateFIPS: '37', countyFIPS: '119', countyName: 'Mecklenburg County', lat: 35.2271, lng: -80.8431 },
  { name: 'Akron', slug: 'akron', state: 'Ohio', stateCode: 'OH', stateFIPS: '39', countyFIPS: '153', countyName: 'Summit County', lat: 41.0814, lng: -81.5190 },
  { name: 'Dallas', slug: 'dallas', state: 'Texas', stateCode: 'TX', stateFIPS: '48', countyFIPS: '113', countyName: 'Dallas County', lat: 32.7767, lng: -96.7970 },
  { name: 'Houston', slug: 'houston', state: 'Texas', stateCode: 'TX', stateFIPS: '48', countyFIPS: '201', countyName: 'Harris County', lat: 29.7604, lng: -95.3698 },
  { name: 'Atlanta', slug: 'atlanta', state: 'Georgia', stateCode: 'GA', stateFIPS: '13', countyFIPS: '121', countyName: 'Fulton County', lat: 33.7490, lng: -84.3880 },
  { name: 'Austin', slug: 'austin', state: 'Texas', stateCode: 'TX', stateFIPS: '48', countyFIPS: '453', countyName: 'Travis County', lat: 30.2672, lng: -97.7431 },
  { name: 'Boston', slug: 'boston', state: 'Massachusetts', stateCode: 'MA', stateFIPS: '25', countyFIPS: '025', countyName: 'Suffolk County', lat: 42.3601, lng: -71.0589 },
  { name: 'Chicago', slug: 'chicago', state: 'Illinois', stateCode: 'IL', stateFIPS: '17', countyFIPS: '031', countyName: 'Cook County', lat: 41.8781, lng: -87.6298 },
  { name: 'Denver', slug: 'denver', state: 'Colorado', stateCode: 'CO', stateFIPS: '08', countyFIPS: '031', countyName: 'Denver County', lat: 39.7392, lng: -104.9903 },
  { name: 'Detroit', slug: 'detroit', state: 'Michigan', stateCode: 'MI', stateFIPS: '26', countyFIPS: '163', countyName: 'Wayne County', lat: 42.3314, lng: -83.0458 },
  { name: 'Miami', slug: 'miami', state: 'Florida', stateCode: 'FL', stateFIPS: '12', countyFIPS: '086', countyName: 'Miami-Dade County', lat: 25.7617, lng: -80.1918 },
  { name: 'Phoenix', slug: 'phoenix', state: 'Arizona', stateCode: 'AZ', stateFIPS: '04', countyFIPS: '013', countyName: 'Maricopa County', lat: 33.4484, lng: -112.0740 },
  { name: 'Seattle', slug: 'seattle', state: 'Washington', stateCode: 'WA', stateFIPS: '53', countyFIPS: '033', countyName: 'King County', lat: 47.6062, lng: -122.3321 },
  { name: 'Los Angeles', slug: 'los-angeles', state: 'California', stateCode: 'CA', stateFIPS: '06', countyFIPS: '037', countyName: 'Los Angeles County', lat: 34.0522, lng: -118.2437 },
  { name: 'San Francisco', slug: 'san-francisco', state: 'California', stateCode: 'CA', stateFIPS: '06', countyFIPS: '075', countyName: 'San Francisco County', lat: 37.7749, lng: -122.4194 },
];

export function getCityBySlug(slug: string): CityDef | undefined {
  return CITIES.find(c => c.slug === slug);
}
