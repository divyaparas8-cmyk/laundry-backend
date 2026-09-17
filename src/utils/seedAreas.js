const Area = require('../models/Area');

const DEFAULT_AREAS = [
  "Abdali",
  "Abdulla Al-Salem",
  "Abu Al Hasaniya",
  "Abu Ftaira",
  "Abu Halifa",
  "Adailiya",
  "Ahmadi",
  "Al Bidaa",
  "Al-Adan",
  "Al-Fnaitees",
  "Al-Masayel",
  "Al-Mutlaa",
  "Al-Nahda",
  "Al Qurain",
  "Al-Qusour",
  "Al-Sheqaya",
  "Al-Siddiq",
  "Al-Sour Gardens",
  "Amghara Industrial",
  "Andalus",
  "Anjafa",
  "Bahra",
  "Bar Al-Jahra",
  "Bayan",
  "Bnaid Al-Qar",
  "Bubiyan Island",
  "Daiya",
  "Dasma",
  "Doha",
  "Doha Port",
  "East Sulaibikhat",
  "Egaila",
  "Fahaheel",
  "Faiha",
  "Failaka Island",
  "Farwaniya",
  "Fintas",
  "Firdous",
  "Granada",
  "Hassawi",
  "Hawalli",
  "Hitteen",
  "Ishbiliya",
  "Jaber Al-Ahmad",
  "Jabriya",
  "Jahra",
  "Jahra Gate",
  "Jahra Industrial",
  "Jibla",
  "Jleeb Al Shuyoukh",
  "Kabd",
  "Kaifan",
  "Kazma",
  "Khaldiya",
  "Khaitan",
  "Khiran",
  "Kuwait City",
  "Mahboula",
  "Mangaf",
  "Mansouriya",
  "Messila",
  "Mirqab",
  "Mishrif",
  "Miskan Island",
  "Mubarak Al-Abdullah",
  "Mubarak Al-Kabeer",
  "Naeem",
  "Nahdha",
  "Nasseem",
  "North West Sulaibikhat",
  "Nuwaisib",
  "Nuzha",
  "Omariya",
  "Ouha Island",
  "Oyoun",
  "Qadsiya",
  "Qairawan",
  "Qasr",
  "Qortuba",
  "Rabiya",
  "Rawda",
  "Rumaithiya",
  "Saad Al Abdullah",
  "Sabah Al Ahmad",
  "Sabah Al-Salem",
  "Salam",
  "Salmi",
  "Salmiya",
  "Salmiya South",
  "Salwa",
  "Shaab",
  "Shamiya",
  "Sharq",
  "Shuhada",
  "Shuwaikh",
  "Shuwaikh Industrial",
  "Subhan Industrial",
  "Subiya",
  "Sulaibikhat",
  "Sulaibiya",
  "Sulaibiya Industrial",
  "Sulaibiya Residential",
  "Surra",
  "Taima",
  "Umm an Namil Island",
  "Wafra",
  "Waha",
  "Warbah Island",
  "West Abu Ftaira",
  "Wista",
  "Yarmouk",
  "Zahra",
  "Zoor",
  "Ardiya",
  "Sabah Al-Nasser",
  "Abdullah Al-Mubarak",
  "Riggae",
  "Rehab",
  "Sabahiya",
  "Hadiya",
  "Riqqa",
  "Ali Sabah Al-Salem",
  "Dajeej",
  "Mina Abdullah",
  "Abbasiya",
  "Shuwaikh Residential"
];

const seedAreas = async () => {
  try {
    const existing = await Area.find({}, 'name');
    const existingNames = new Set(existing.map(a => (a.name || '').trim().toLowerCase()));
    
    const missingAreas = DEFAULT_AREAS.filter(name => !existingNames.has(name.trim().toLowerCase()));
    if (missingAreas.length > 0) {
      console.log(`Seeding ${missingAreas.length} missing areas...`);
      const areaDocs = missingAreas.map(name => ({ name }));
      await Area.insertMany(areaDocs);
      console.log(`Successfully seeded ${missingAreas.length} new areas.`);
    }

    // Ensure Home Service branch exists
    const Branch = require('../models/Branch');
    const homeBranch = await Branch.findOne({ name: /^Home Service$/i });
    if (!homeBranch) {
      await Branch.create({
        name: 'Home Service',
        address: 'Home Service Central Hub',
        phone: '99999994',
        manager: 'Logistics Manager',
        status: 'Active'
      });
      console.log("Successfully ensured 'Home Service' branch exists.");
    }
  } catch (error) {
    console.error('Error seeding default areas:', error);
  }
};

module.exports = seedAreas;
