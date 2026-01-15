/**
 * Download and prepare training data
 * Downloads PTB (Penn Treebank) and/or WikiText-2 for pre-training
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '../data');
const PRETRAINED_MODEL_PATH = path.join(DATA_DIR, 'pretrained.json');

// Data sources (using raw GitHub files for simplicity)
const DATASETS = {
  ptb: {
    name: 'Penn Treebank',
    files: {
      train: 'https://raw.githubusercontent.com/wojzaremba/lstm/master/data/ptb.train.txt',
      valid: 'https://raw.githubusercontent.com/wojzaremba/lstm/master/data/ptb.valid.txt',
      test: 'https://raw.githubusercontent.com/wojzaremba/lstm/master/data/ptb.test.txt',
    },
  },
  wikitext2: {
    name: 'WikiText-2',
    files: {
      train: 'https://raw.githubusercontent.com/pytorch/examples/master/word_language_model/data/wikitext-2/train.txt',
      valid: 'https://raw.githubusercontent.com/pytorch/examples/master/word_language_model/data/wikitext-2/valid.txt',
      test: 'https://raw.githubusercontent.com/pytorch/examples/master/word_language_model/data/wikitext-2/test.txt',
    },
  },
  lambada: {
    name: 'LAMBADA',
    files: {
      test: 'https://raw.githubusercontent.com/cybertronai/bflm/master/lambada_test.jsonl',
    }
  },
  // Simple English Wikipedia subset (embedded for reliability)
  simple: {
    name: 'Simple English Corpus',
    embedded: true,
    data: `
The sun rises in the east and sets in the west every day.
Water is essential for all forms of life on Earth.
Plants use sunlight to produce food through photosynthesis.
Animals need food water and shelter to survive.
The Earth revolves around the sun once every year.
The moon orbits the Earth approximately every month.
Gravity is the force that keeps planets in orbit.
Light travels faster than sound through space.
Electricity powers most modern devices and machines.
Computers process information using binary code.
The internet connects millions of computers worldwide.
Languages allow humans to communicate complex ideas.
Mathematics is the study of numbers and patterns.
Science helps us understand the natural world.
History teaches us about past events and civilizations.
Geography studies the Earth and its features.
Biology is the study of living organisms.
Chemistry examines matter and its properties.
Physics explores the fundamental laws of nature.
Music is a universal form of human expression.
Art reflects culture and human creativity.
Literature preserves stories and ideas across generations.
Democracy is a system of government by the people.
Economics studies the production and distribution of goods.
Psychology explores human behavior and mental processes.
Medicine helps prevent and cure diseases.
Engineering applies science to solve practical problems.
Architecture designs buildings and structures.
Agriculture produces food for human consumption.
Transportation moves people and goods between places.
Communication technology has transformed modern society.
Education prepares people for life and work.
Law establishes rules for society to function.
Ethics examines moral principles and values.
Philosophy seeks to understand fundamental truths.
Religion provides meaning and community for many people.
Sports promote physical fitness and competition.
Games provide entertainment and social interaction.
Travel broadens perspectives and cultural understanding.
Food is essential for energy and health.
Sleep is necessary for physical and mental recovery.
Exercise improves health and reduces stress.
Reading develops vocabulary and knowledge.
Writing allows ideas to be preserved and shared.
Speaking is the primary form of human communication.
Listening is essential for understanding others.
Learning is a lifelong process of acquiring knowledge.
Teaching shares knowledge with others.
Research discovers new information and insights.
Innovation creates new products and solutions.
Technology continues to advance rapidly.
Climate affects weather patterns around the world.
Seasons change throughout the year.
Weather varies from day to day.
Temperature measures how hot or cold something is.
Wind is moving air in the atmosphere.
Rain provides water for plants and animals.
Snow falls when temperatures are below freezing.
Clouds form when water vapor condenses.
Rivers flow from mountains to the sea.
Lakes store fresh water on land.
Oceans cover most of the Earth surface.
Mountains are tall landforms created by geological forces.
Valleys form between mountains and hills.
Forests contain many trees and wildlife.
Deserts receive very little rainfall.
Grasslands support grazing animals.
Islands are land surrounded by water.
Volcanoes release molten rock from underground.
Earthquakes occur when tectonic plates shift.
Hurricanes are powerful tropical storms.
Tornadoes are violent rotating columns of air.
Fire needs fuel oxygen and heat to burn.
Ice is frozen water below zero degrees Celsius.
Steam is water vapor at high temperatures.
Metals conduct electricity and heat well.
Wood comes from trees and is used for building.
Plastic is a synthetic material made from chemicals.
Glass is made by melting sand at high temperatures.
Paper is made from wood pulp.
Cotton is a natural fiber used for clothing.
Wool comes from sheep and keeps us warm.
Silk is produced by silkworms.
Leather is made from animal hides.
Food provides nutrients for the body.
Vegetables are plant parts we eat for nutrition.
Fruits contain seeds and are often sweet.
Meat comes from animals and provides protein.
Fish live in water and are a source of food.
Bread is made from flour water and yeast.
Rice is a grain eaten by billions of people.
Milk comes from mammals and contains calcium.
Eggs are laid by birds and used in cooking.
Cheese is made from milk.
Butter is made from cream.
Sugar adds sweetness to food and drinks.
Salt enhances the flavor of food.
Spices add flavor and variety to cooking.
Coffee and tea are popular beverages.
Water is the most essential drink.
Juice comes from fruits and vegetables.
Alcohol is produced by fermentation.
Cooking transforms raw ingredients into meals.
Baking uses heat in an enclosed oven.
Frying cooks food in hot oil.
Boiling cooks food in hot water.
Grilling cooks food over direct heat.
Freezing preserves food by stopping bacterial growth.
Refrigeration keeps food cool and fresh.
Canning preserves food in sealed containers.
Drying removes moisture to preserve food.
Smoking adds flavor and preserves meat and fish.
The cat sat on the mat and watched the birds outside.
Dogs are loyal companions who love their owners.
Horses have been used for transportation for thousands of years.
Cows provide milk meat and leather.
Sheep provide wool and meat.
Pigs are intelligent animals raised for food.
Chickens lay eggs and provide meat.
Ducks can swim and fly.
Geese migrate long distances each year.
Eagles are powerful birds of prey.
Owls hunt at night using excellent hearing.
Parrots can learn to mimic human speech.
Penguins live in cold climates and cannot fly.
Elephants are the largest land animals.
Lions are called the king of the jungle.
Tigers are the largest wild cats.
Bears are powerful omnivores.
Wolves hunt in packs.
Foxes are clever and adaptable.
Deer are graceful herbivores.
Rabbits reproduce quickly.
Squirrels gather and store nuts.
Mice are small rodents.
Rats are intelligent and adaptable.
Bats are the only flying mammals.
Whales are the largest animals on Earth.
Dolphins are intelligent marine mammals.
Sharks are ancient predators of the sea.
Octopuses have eight arms and are very intelligent.
Jellyfish have no brain or bones.
Crabs walk sideways.
Lobsters live on the ocean floor.
Shrimp are small crustaceans.
Oysters produce pearls.
Snails carry shells on their backs.
Butterflies undergo metamorphosis.
Bees pollinate flowers and make honey.
Ants live in complex colonies.
Spiders spin webs to catch prey.
Mosquitoes spread diseases.
Flies are common insects.
Beetles are the most diverse group of insects.
Grasshoppers can jump great distances.
Crickets make sounds by rubbing their legs.
Worms live in soil and help plants grow.
Snakes are legless reptiles.
Lizards are common reptiles.
Turtles carry shells for protection.
Crocodiles are ancient predators.
Frogs begin life as tadpoles.
Toads have dry bumpy skin.
Salamanders can regenerate lost limbs.
`.trim().split('\n').filter(l => l.trim()),
  },
};

/**
 * Download a file from URL
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;
    
    console.log(`Downloading: ${url}`);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Download and extract training data
 */
async function downloadTrainingData(datasetName = 'simple') {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const dataset = DATASETS[datasetName];
  if (!dataset) {
    throw new Error(`Unknown dataset: ${datasetName}`);
  }
  
  console.log(`\nPreparing dataset: ${dataset.name}`);
  
  if (dataset.embedded) {
    // Use embedded data
    const trainPath = path.join(DATA_DIR, 'train.txt');
    fs.writeFileSync(trainPath, dataset.data.join('\n'));
    console.log(`Created training file with ${dataset.data.length} lines`);
    return { train: trainPath };
  }
  
  // Download files
  const paths = {};
  for (const [split, url] of Object.entries(dataset.files)) {
    const destPath = path.join(DATA_DIR, `${datasetName}_${split}.txt`);
    
    if (fs.existsSync(destPath)) {
      console.log(`File exists: ${destPath}`);
      paths[split] = destPath;
      continue;
    }
    
    try {
      await downloadFile(url, destPath);
      paths[split] = destPath;
      console.log(`Downloaded: ${destPath}`);
    } catch (err) {
      console.error(`Failed to download ${split}: ${err.message}`);
    }
  }
  
  return paths;
}

/**
 * Check if pretrained model exists
 */
function hasPretrainedModel() {
  return fs.existsSync(PRETRAINED_MODEL_PATH);
}

/**
 * Get pretrained model path
 */
function getPretrainedModelPath() {
  return PRETRAINED_MODEL_PATH;
}

/**
 * Save pretrained model
 */
function savePretrainedModel(engine) {
  const state = engine.toJSON();
  fs.writeFileSync(PRETRAINED_MODEL_PATH, JSON.stringify(state));
  console.log(`Pretrained model saved to ${PRETRAINED_MODEL_PATH}`);
  return PRETRAINED_MODEL_PATH;
}

module.exports = {
  downloadTrainingData,
  hasPretrainedModel,
  getPretrainedModelPath,
  savePretrainedModel,
  DATASETS,
  DATA_DIR,
  PRETRAINED_MODEL_PATH,
};
