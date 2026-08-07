import type { Meta, StoryObj } from '@storybook/nextjs'
import { I18nProvider } from '@/lib/i18n/context'
import { FiguresView } from './figures-view'
import type { Customer, Member, Office } from '@/lib/supabase/types'

const ORG = '00000000-0000-0000-0000-000000000001'

const offices: Office[] = [
  ['o-oslo', 'Oslo', 'NO', 'Europe/Oslo', true],
  ['o-sthlm', 'Stockholm', 'SE', 'Europe/Stockholm', false],
  ['o-vilnius', 'Vilnius', 'LT', 'Europe/Vilnius', false],
  ['o-london', 'London', 'GB', 'Europe/London', true],
].map(([id, name, country_code, timezone, is_hq], i) => ({
  id: id as string,
  org_id: ORG,
  name: name as string,
  address: null,
  city: name as string,
  postal_code: null,
  country_code: country_code as string,
  timezone: timezone as string,
  latitude: null,
  longitude: null,
  sort_order: i,
  is_hq: is_hq as boolean,
  created_at: '2020-01-01T00:00:00Z',
}))

function member(
  id: string,
  display_name: string,
  home_office_id: string,
  start_date: string,
  extra: Partial<Member> = {},
): Member {
  return {
    id,
    org_id: ORG,
    user_id: null,
    display_name,
    full_name: display_name,
    initials: null,
    email: `${id}@example.com`,
    avatar_url: null,
    nicknames: [],
    home_office_id,
    location_code: home_office_id === 'o-london' ? 'GB' : 'NO',
    role: 'member',
    is_active: true,
    start_date,
    anniversary_visible: true,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z',
    ...extra,
  }
}

const members: Member[] = [
  member('m1', 'Øystein Pilskog', 'o-oslo', '2009-03-01', { preferred_locale: 'no' }),
  member('m2', 'Johan Berg', 'o-oslo', '2014-08-15', { preferred_locale: 'no' }),
  member('m3', 'Marit Lund', 'o-oslo', '2018-01-08'),
  member('m4', 'Anders Haug', 'o-oslo', '2021-05-03'),
  member('m5', 'Erik Sund', 'o-oslo', '2023-09-01'),
  member('m6', 'Anna Nilsson', 'o-sthlm', '2016-02-01', { preferred_locale: 'sv' }),
  member('m7', 'Karin Ek', 'o-sthlm', '2020-11-16'),
  member('m8', 'Tomas Kazlauskas', 'o-vilnius', '2017-06-01', { preferred_locale: 'lt' }),
  member('m9', 'Ruta Petraityte', 'o-vilnius', '2019-04-15'),
  member('m10', 'Darius Jonaitis', 'o-vilnius', '2022-02-28'),
  member('m11', 'James Whitfield', 'o-london', '2012-10-01', { preferred_locale: 'en' }),
  member('m12', 'Sophie Clarke', 'o-london', '2019-08-19'),
  member('m13', 'Oliver Grant', 'o-london', '2024-01-15'),
]

const CUSTOMER_COUNTRIES: Array<[string, number]> = [
  ['NO', 14],
  ['GB', 11],
  ['SE', 6],
  ['DK', 3],
  ['LT', 2],
  ['IE', 2],
  ['FI', 1],
  ['NL', 1],
]

const customers: Customer[] = CUSTOMER_COUNTRIES.flatMap(([cc, n]) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${cc}-${i}`,
    org_id: ORG,
    name: `${cc} Kunde ${i + 1}`,
    address: null,
    city: null,
    postal_code: null,
    country_code: cc,
    latitude: null,
    longitude: null,
    aliases: [],
    notes: null,
    sort_order: i,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z',
  })),
)

const meta: Meta<typeof FiguresView> = {
  title: 'Dashboard/FiguresView',
  component: FiguresView,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'espresso' } },
  decorators: [
    Story => (
      <I18nProvider initialLocale="no">
        <div style={{ width: '100vw', height: '100vh', background: '#050507' }}>
          <Story />
        </div>
      </I18nProvider>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof FiguresView>

export const Default: Story = {
  args: { members, offices, customers, orgName: 'CalWin AS', time: new Date() },
}

/** Fresh workspace — no customers, no start dates, one office. */
export const Empty: Story = {
  args: {
    members: [],
    offices: [offices[0]],
    customers: [],
    orgName: 'CalWin AS',
    time: new Date(),
  },
}
