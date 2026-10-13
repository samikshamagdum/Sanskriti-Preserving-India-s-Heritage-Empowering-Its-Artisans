const User = require('./User');
const Tradition = require('./Tradition');
const Artist = require('./Artist');
const Place = require('./Place');
const Event = require('./Event');
const Story = require('./Story');
const Artefact = require('./Artefact');
const Contribution = require('./Contribution');
const CultureTrail = require('./CultureTrail');
const VoiceHeritage = require('./VoiceHeritage');
const Badge = require('./Badge');
const CulturePack = require('./CulturePack');
const CultureLens = require('./CultureLens');
const Report = require('./Report');
const CulturalItem = require('./CulturalItem');
const CommunityPlace = require('./CommunityPlace');
const Source = require('./Source');
const CulturalImage = require('./CulturalImage');
const Location = require('./Location');
const Institution = require('./Institution');
const Product = require('./Product');
const Order = require('./Order');

const MODELS = {
  users: User,
  traditions: Tradition,
  artists: Artist,
  places: Place,
  events: Event,
  stories: Story,
  artefacts: Artefact,
  contributions: Contribution,
  culturetrails: CultureTrail,
  voiceheritage: VoiceHeritage,
  badges: Badge,
  culturepacks: CulturePack,
  culturelens: CultureLens,
  reports: Report,
  culturalitems: CulturalItem,
  communityplaces: CommunityPlace,
  sources: Source,
  culturalimages: CulturalImage,
  locations: Location,
  institutions: Institution,
  products: Product,
  orders: Order
};

module.exports = MODELS;
