// Shared domain types for TasteBridge Groups.

export type AnchorKind =
  | 'auto'
  | 'artist'
  | 'movie'
  | 'tv_show'
  | 'book'
  | 'videogame'
  | 'brand'
  | 'place'
  | 'food'
  | 'vibe';

export interface Anchor {
  text: string;
  kind: AnchorKind;
}

export interface Person {
  id: string;
  name: string;
  anchors: Anchor[];
  /** Hard dislikes, e.g. "karaoke", "spicy". Always veto matching candidates. */
  avoid?: string[];
  /** Key person (e.g. guest of honor): strong axis dislikes also veto. */
  isKey?: boolean;
}

export interface Constraints {
  city: string;
  neighborhood?: string;
  datetime?: string;
  /** 1 ($) .. 4 ($$$$). Hard cap on place price level. */
  budget?: number;
  dietary?: string[];
  accessibility?: string[];
  /** Free-text vibe constraints, e.g. "no loud venues", "outdoorsy". */
  vibes?: string[];
}

export type SlotId = 'activity' | 'food' | 'drink' | 'winddown';

export interface GroupRequest {
  people: Person[];
  constraints: Constraints;
  slots?: SlotId[];
  includeWindDown?: boolean;
}

// ---------------------------------------------------------------- Qloo

export interface QlooTag {
  id: string;
  name: string;
  type?: string;
}

export type DataSource = 'qloo-live' | 'sample' | 'sample-fallback';

export interface QlooEntity {
  id: string;
  name: string;
  /** urn:entity:* */
  type: string;
  tags: QlooTag[];
  popularity?: number;
  description?: string;
  /** 1..4 for places */
  priceLevel?: number;
  address?: string;
  neighborhood?: string;
  city?: string;
  metro?: string;
  country?: string;
  rating?: number;
  image?: string;
  /** Qloo affinity vs. the request signal, 0..1 */
  affinity?: number;
  /** Raw explainability payload when Qloo returns one */
  explain?: unknown;
  source: DataSource;
}

export interface InsightsParams {
  type: string;
  signalEntities?: string[];
  signalTags?: string[];
  filterTags?: string[];
  excludeTags?: string[];
  /** Score exactly these entities (Qloo filter.results.entities, ≤50) against the signals */
  resultEntities?: string[];
  locationQuery?: string;
  priceMin?: number;
  priceMax?: number;
  take?: number;
  explain?: boolean;
}

export interface InsightsResult {
  entities: QlooEntity[];
  warnings: string[];
}

export interface ProviderStats {
  mode: 'live' | 'sample';
  calls: number;
  cacheHits: number;
  retries: number;
  rateLimited: number;
  failures: number;
  staleServed: number;
  fallbacks: number;
}

export interface QlooProvider {
  readonly mode: 'live' | 'sample';
  searchEntity(query: string, opts?: { types?: string[]; take?: number }): Promise<QlooEntity[]>;
  searchTags(query: string, opts?: { take?: number }): Promise<QlooTag[]>;
  insights(params: InsightsParams): Promise<InsightsResult>;
  stats(): ProviderStats;
}

// ---------------------------------------------------------------- Taste model

export type Axis = 'volume' | 'spice' | 'scene' | 'novelty' | 'price';

export type AxisVector = Record<Axis, number>;

export interface ResolvedAnchor {
  anchor: Anchor;
  status: 'resolved' | 'unresolved';
  entity?: QlooEntity;
  tag?: QlooTag;
  /** how it was resolved */
  method?: 'search' | 'search-broadened' | 'search-rewritten' | 'tag' | 'vibe-keyword';
  confidence: number;
  note?: string;
}

export interface PersonProfile {
  person: Person;
  anchors: ResolvedAnchor[];
  /** -1..1 per axis, 0 = no preference */
  pref: AxisVector;
  /** How many resolved anchors contributed evidence to each axis */
  prefEvidence: Record<Axis, number>;
  signalEntityIds: string[];
  signalTagIds: string[];
  topTags: { id: string; name: string; weight: number }[];
  lowConfidence: boolean;
}

export interface Conflict {
  axis: Axis;
  label: string;
  poleA: string; // positive pole
  poleB: string; // negative pole
  severity: number; // 0..1
  level: 'low' | 'medium' | 'high';
  sideA: string[]; // person ids on positive pole
  sideB: string[];
  explanation: string;
}

export interface GroupProfile {
  people: PersonProfile[];
  overlapTags: { id: string; name: string; people: string[] }[];
  sharedTags: { id: string; name: string; people: string[] }[];
  uniqueTags: { personId: string; tags: { id: string; name: string }[] }[];
  conflicts: Conflict[];
  groupPref: AxisVector;
}

// ---------------------------------------------------------------- Scoring

export interface Candidate {
  entity: QlooEntity;
  slot: SlotId;
  /** per-person individual affinity 0..1 */
  a: Record<string, number>;
  /** per-person raw (qloo) affinity, if any */
  qloo: Record<string, number | undefined>;
  /** per-person Qloo explainability: ids of that person's signal entities Qloo says drove this match, strongest first */
  explain?: Record<string, string[]>;
  /** candidate position per axis */
  pos: AxisVector;
}

export interface ScoreBreakdown {
  coverage: number;
  minAffinity: number;
  conflictPenalty: number; // 1 = conflict-free
  score: number;
  weakestPersonId: string;
}

export interface Veto {
  personId: string;
  reason: string;
  kind: 'avoid' | 'axis' | 'hard';
}

export interface ScoredCandidate extends Candidate {
  breakdown: ScoreBreakdown;
  vetoes: Veto[];
  hardRejected?: string;
  /** Requested dietary/accessibility needs the venue's tags confirm / cannot confirm */
  verified: string[];
  unverified: string[];
  /** Persons for whom this is a "personal win" */
  winFor: string[];
}

export interface ItineraryStop {
  slot: SlotId | 'encore';
  title: string;
  place: {
    id: string;
    name: string;
    type: string;
    address?: string;
    neighborhood?: string;
    priceLevel?: number;
    rating?: number;
    image?: string;
    description?: string;
  };
  time?: string;
  score: ScoreBreakdown;
  affinities: Record<string, number>;
  why: string;
  serves: { personId: string; name: string; reason: string }[];
  conflicts: { axis: Axis; text: string; resolution: string }[];
  evidence: {
    source: DataSource;
    qlooEntityIds: string[];
    candidateTags: QlooTag[];
    signals: { personId: string; anchor: string; entityId?: string; tagId?: string }[];
    affinitySignals: { personId: string; qlooAffinity?: number; individual: number }[];
    explain?: unknown;
  };
  warnings: string[];
  alternatives: { id: string; name: string; score: number }[];
}

export interface PlanMetrics {
  meanScore: number;
  minPersonAvg: number;
  minPersonId: string;
  equity: number; // 1 - gini over per-person avg affinity
  winsByPerson: Record<string, string[]>; // personId -> stop titles
  peopleWithoutWin: string[];
}

export interface TraceEvent {
  t: number; // ms since start
  phase: 'plan' | 'act' | 'observe' | 'reflect' | 'retry' | 'synthesize' | 'info';
  message: string;
  data?: unknown;
}

export interface SessionState {
  /** Everything needed to rebalance statelessly. */
  request: GroupRequest;
  profiles: PersonProfile[];
  pools: Record<string, Candidate[]>;
  selection: Record<string, string>; // slot/encore -> entity id
  /** entity ids already swapped out per stop, so repeated rebalances cycle through alternatives */
  rejected: Record<string, string[]>;
  dataMode: DataMode;
}

export type DataMode = 'live' | 'sample' | 'live-degraded';

export interface PlanResult {
  ok: true;
  dataMode: DataMode;
  banner?: string;
  profile: GroupProfile;
  itinerary: ItineraryStop[];
  metrics: PlanMetrics;
  warnings: string[];
  unresolved: { personId: string; anchor: string }[];
  trace: TraceEvent[];
  stats: ProviderStats;
  session: SessionState;
  rebalance?: RebalanceDiff;
}

export interface RebalanceDiff {
  slot: string;
  removed: string;
  added: string;
  before: { meanScore: number; minPersonAvg: number };
  after: { meanScore: number; minPersonAvg: number };
  winsPreserved: boolean;
  note: string;
}
