'use client';
import { useState, useId } from 'react';
import { MapPin, X, Search, LoaderCircle } from 'lucide-react';
import { countries } from '@/lib/location';
import { plans, type MatchOptions, type Plan } from '@/lib/domain';
import { api, errorText } from '@/lib/client';
import { ToggleRow } from './app-primitives';
import { PlanRequirement } from './plan-requirement';
type City = { label: string; latitude: number; longitude: number };
export function LocationPreferences({
  options,
  plan,
  onChange,
  onUpgrade,
}: {
  options: MatchOptions;
  plan: Plan;
  onChange: (value: MatchOptions) => void;
  onUpgrade: () => void;
}) {
  const [query, setQuery] = useState(''),
    [cities, setCities] = useState<City[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [label, setLabel] = useState('');
  const id = useId();
  const cap = plans[plan].countries;
  const update = (patch: Partial<MatchOptions>) =>
    onChange({ ...options, ...patch, partnerType: 'human' });
  async function search() {
    if (plan === 'free') {
      onUpgrade();
      return;
    }
    setBusy(true);
    setError('');
    setCities([]);
    try {
      const found = await api<City[]>(
        '/locations/cities?q=' + encodeURIComponent(query),
      );
      setCities(found);
      if (!found.length) setError('No cities found. Try adding a country.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function locate() {
    if (plan === 'free') {
      onUpgrade();
      return;
    }
    if (!navigator.geolocation) {
      setError('Location is unavailable. Search for your city instead.');
      return;
    }
    setBusy(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update({
          nearMe: true,
          location: {
            latitude: Math.round(pos.coords.latitude * 10) / 10,
            longitude: Math.round(pos.coords.longitude * 10) / 10,
          },
        });
        setLabel('Current location');
        setBusy(false);
      },
      () => {
        setError(
          'Location access was unavailable. Search for your city instead.',
        );
        setBusy(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }
  return (
    <section className="location-preferences" aria-label="Location preferences">
      <h3>
        <MapPin size={17} />
        Location preferences
      </h3>
      <p className="field-note">
        Country filters apply to people only. Include and exclude up to {cap}{' '}
        countries each.
      </p>
      {(['includeCountries', 'excludeCountries'] as const).map((key) => (
        <div className="form-field" key={key}>
          <label htmlFor={id + key}>
            {key === 'includeCountries'
              ? 'Include countries'
              : 'Exclude countries'}{' '}
            <span className="field-note">
              {options[key].length}/{cap}
            </span>
          </label>
          <div className="country-chips">
            {options[key].map((code) => (
              <button
                type="button"
                key={code}
                onClick={() =>
                  update({ [key]: options[key].filter((c) => c !== code) })
                }
                aria-label={
                  'Remove ' +
                  (countries.find((c) => c.code === code)?.name ?? code)
                }
              >
                {countries.find((c) => c.code === code)?.name ?? code}
                <X size={12} />
              </button>
            ))}
          </div>
          <select
            id={id + key}
            value=""
            disabled={options[key].length >= cap}
            onChange={(e) => {
              if (e.target.value)
                update({ [key]: [...options[key], e.target.value] });
            }}
          >
            <option value="">
              {options[key].length >= cap
                ? 'Country limit reached'
                : 'Choose a country…'}
            </option>
            {countries
              .filter(
                (c) =>
                  !options.includeCountries.includes(c.code) &&
                  !options.excludeCountries.includes(c.code),
              )
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
      ))}
      <p className="field-note">
        3 each on Free · <PlanRequirement plan="basic" /> 5 each ·{' '}
        <PlanRequirement plan="plus" /> 10 each
      </p>
      <ToggleRow
        title="Near me"
        requiredPlan="basic"
        description="Meet people within approximately 100 km."
        checked={options.nearMe}
        onChange={(v) => {
          if (plan === 'free') {
            onUpgrade();
            return;
          }
          update({ nearMe: v, location: v ? options.location : undefined });
          if (!v) setLabel('');
        }}
      />
      {(options.nearMe || plan === 'free') && (
        <div className="nearby-controls">
          <button
            type="button"
            className="button button-small"
            disabled={busy}
            onClick={locate}
          >
            <MapPin size={15} />
            Use my location <PlanRequirement plan="basic" />
          </button>
          <div className="city-search">
            <input
              aria-label="City name"
              placeholder="Or enter your city"
              value={query}
              maxLength={100}
              onChange={(e) => {
                setQuery(e.target.value);
                setCities([]);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void search();
                }
              }}
            />
            <button
              type="button"
              aria-label="Search cities"
              disabled={busy || query.trim().length < 2}
              onClick={() => void search()}
            >
              {busy ? <LoaderCircle size={16} /> : <Search size={16} />}
            </button>
          </div>
          {cities.length > 0 && (
            <ul className="city-results">
              {cities.map((city, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      update({
                        nearMe: true,
                        location: {
                          latitude: city.latitude,
                          longitude: city.longitude,
                        },
                      });
                      setLabel(city.label);
                      setCities([]);
                    }}
                  >
                    {city.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {label && <p className="field-note">Using {label}</p>}
          <p className="field-note">
            Location stays private. Partners are located approximately; VPNs may
            affect results. City search uses{' '}
            <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">
              Photon
            </a>{' '}
            / © OpenStreetMap contributors.
          </p>
        </div>
      )}
      {options.nearMe && !options.location && (
        <p className="field-note">
          Choose a city or allow location access before matching.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
