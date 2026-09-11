export const countryCodes =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  );
const names = new Intl.DisplayNames(['en'], { type: 'region' });
export const countries = countryCodes
  .map((code) => ({ code, name: names.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name));
export type MatchLocation = {
  country?: string;
  latitude?: number;
  longitude?: number;
};
export function locationCompatible(
  a: {
    includeCountries?: string[];
    excludeCountries?: string[];
    nearMe?: boolean;
  },
  al: MatchLocation,
  b: {
    includeCountries?: string[];
    excludeCountries?: string[];
    nearMe?: boolean;
  },
  bl: MatchLocation,
) {
  const accepts = (o: typeof a, country?: string) =>
    !(
      o.includeCountries?.length &&
      (!country || !o.includeCountries.includes(country))
    ) && !(country && o.excludeCountries?.includes(country));
  if (!accepts(a, bl.country) || !accepts(b, al.country)) return false;
  if (!a.nearMe && !b.nearMe) return true;
  if (
    ![al.latitude, al.longitude, bl.latitude, bl.longitude].every(
      (v) => typeof v === 'number' && Number.isFinite(v),
    )
  )
    return false;
  const rad = Math.PI / 180,
    dlat = (bl.latitude! - al.latitude!) * rad,
    dlon = (bl.longitude! - al.longitude!) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(al.latitude! * rad) *
      Math.cos(bl.latitude! * rad) *
      Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h))) <= 100;
}
