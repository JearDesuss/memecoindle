// memecoindle dataset
// Sources: memecoin.wiki (158-coin catalogue + per-article figures), contemporaneous reporting, market data.
// m  = PEAK market cap in $M (approx)
// cm = CURRENT market cap in $M. Coins added Aug 2026 carry the live CoinGecko
//      figure for their pinned id (tools/logo-overrides.json); older entries are
//      a mid/late-2026 snapshot refined against memecoin.wiki article data.
// The game grades both by order-of-magnitude range, not exact value.
// c = chain, y = launch year, g = category/type, s = fate (metadata, not a game axis), l = lore, w = memecoin.wiki slug

var CHAINS = ["Solana", "Ethereum", "BNB Chain", "Base", "Robinhood", "Bitcoin", "Cardano", "Stable Chain", "Own chain"];
var EVM_FAMILY = { "Ethereum": 1, "BNB Chain": 1, "Base": 1, "Robinhood": 1, "Stable Chain": 1 };

var CATS = ["Dog", "Cat", "Frog", "Animal", "Character", "Person", "Politics", "Celebrity", "AI", "Joke", "Brand"];
var CAT_FAMILY = {
  "Dog": "animal", "Cat": "animal", "Frog": "animal", "Animal": "animal",
  "Person": "people", "Politics": "people", "Celebrity": "people",
  "AI": "tech", "Brand": "tech",
  "Character": "meme", "Joke": "meme"
};

// Peak market cap ranges (order of magnitude):
// 1: <$10M · 2: $10M–$100M · 3: $100M–$1B · 4: $1B–$10B · 5: $10B+
function capTier(m) { if (m < 10) return 1; if (m < 100) return 2; if (m < 1000) return 3; if (m < 10000) return 4; return 5; }
var TIER_LABELS = ["", "<$10M", "$10M+", "$100M+", "$1B+", "$10B+"];

// Current market cap ranges (finer at the bottom — that's where memecoins live now):
// 1: <$1M · 2: $1M–$10M · 3: $10M–$100M · 4: $100M–$1B · 5: $1B+
function nowTier(m) { if (m < 1) return 1; if (m < 10) return 2; if (m < 100) return 3; if (m < 1000) return 4; return 5; }
var NOW_LABELS = ["", "<$1M", "$1M+", "$10M+", "$100M+", "$1B+"];

var COINS = [
  { n: "Dogecoin", t: "DOGE", c: "Own chain", y: 2013, m: 88000, cm: 10900, g: "Dog", s: "Icon", l: "The 2013 joke that invented the entire category.", w: "dogecoin" },
  { n: "Shiba Inu", t: "SHIB", c: "Ethereum", y: 2020, m: 41000, cm: 2600, g: "Dog", s: "Icon", l: "The self-styled Dogecoin killer that hit $41B in 2021.", w: "shiba_inu" },
  { n: "Pepe", t: "PEPE", c: "Ethereum", y: 2023, m: 11000, cm: 1100, g: "Frog", s: "Icon", l: "The frog that became the largest pure meme coin of its era.", w: "pepe" },
  { n: "Dogwifhat", t: "WIF", c: "Solana", y: 2023, m: 4800, cm: 136, g: "Dog", s: "Icon", l: "A shiba in a knitted hat. It's literally just a dog wif a hat.", w: "dogwifhat" },
  { n: "BONK", t: "BONK", c: "Solana", y: 2022, m: 4000, cm: 250, g: "Dog", s: "Icon", l: "Solana's flagship community dog, airdropped at the chain's lowest hour.", w: "bonk" },
  { n: "Official Trump", t: "TRUMP", c: "Solana", y: 2025, m: 15000, cm: 355, g: "Politics", s: "Scandal", l: "Launched by a sitting president-elect days before inauguration. Briefly among the most valuable memecoins ever.", w: "official_trump" },
  { n: "Melania", t: "MELANIA", c: "Solana", y: 2025, m: 2000, cm: 107, g: "Politics", s: "Scandal", l: "The First Lady's coin. Collapsed sharply; fraud allegations followed in court.", w: "melania" },
  { n: "LIBRA", t: "LIBRA", c: "Solana", y: 2025, m: 4500, cm: 1.99, g: "Politics", s: "Scandal", l: "Promoted by Argentina's president, dead in hours, triggered criminal probes and a political crisis.", w: "libra" },
  { n: "HAWK", t: "HAWK", c: "Solana", y: 2024, m: 490, cm: 1.14, g: "Celebrity", s: "Scandal", l: "Hawk Tuah girl's coin: -90% within hours, lawsuit, federal inquiry.", w: "hawk" },
  { n: "YZY", t: "YZY", c: "Solana", y: 2025, m: 3000, cm: 40, g: "Celebrity", s: "Scandal", l: "Kanye's token touched $3B within hours, then collapsed amid insider allegations.", w: "yzy" },
  { n: "SafeMoon", t: "SFM", c: "BNB Chain", y: 2021, m: 8000, cm: 0.388, g: "Joke", s: "Scandal", l: "The reflection-token mania of 2021. CEO got 100 months in prison.", w: "safemoon" },
  { n: "Squid Game", t: "SQUID", c: "BNB Chain", y: 2021, m: 25, cm: 1.45, g: "Brand", s: "Scandal", l: "The rug that made 'rug pull' mainstream news — you could buy, but never sell.", w: null },
  { n: "SLERF", t: "SLERF", c: "Solana", y: 2024, m: 700, cm: 2.219, g: "Animal", s: "Scandal", l: "Dev fat-fingered $10M of presale funds into the burn address. It mooned anyway.", w: "slerf" },
  { n: "Pippin", t: "PIPPIN", c: "Solana", y: 2024, m: 900, cm: 18, g: "AI", s: "Scandal", l: "Stick-figure unicorn by the BabyAGI author. Second peak near $900M, then an insider-blamed crash.", w: "pippin" },
  { n: "Zerebro", t: "ZEREBRO", c: "Solana", y: 2024, m: 500, cm: 38.1, g: "AI", s: "Scandal", l: "Its creator staged his own death as a stunt. Twice, arguably.", w: "zerebro" },
  { n: "DADDY", t: "DADDY", c: "Solana", y: 2024, m: 280, cm: 8.25, g: "Celebrity", s: "Scandal", l: "Andrew Tate's entry in the celebrity coin war, dogged by insider-buying allegations.", w: "daddy" },
  { n: "Fartcoin", t: "FARTCOIN", c: "Solana", y: 2024, m: 2500, cm: 140, g: "Joke", s: "Faded", l: "Born from an AI's conversation about flatulence. Reached multiple billions. Hot air, literally.", w: "fartcoin" },
  { n: "Goatseus Maximus", t: "GOAT", c: "Solana", y: 2024, m: 1300, cm: 13, g: "AI", s: "Faded", l: "Shilled into existence by the Truth Terminal AI. First pump.fun token to $1B.", w: "goatseus_maximus" },
  { n: "Peanut the Squirrel", t: "PNUT", c: "Solana", y: 2024, m: 2000, cm: 40, g: "Animal", s: "Faded", l: "New York euthanized a pet squirrel and the trenches made it a billion-dollar martyr.", w: "peanut_the_squirrel" },
  { n: "Moo Deng", t: "MOODENG", c: "Solana", y: 2024, m: 614, cm: 36, g: "Animal", s: "Faded", l: "A viral baby pygmy hippo from a Thai zoo, tokenized within days.", w: "moo_deng" },
  { n: "Popcat", t: "POPCAT", c: "Solana", y: 2023, m: 2000, cm: 50, g: "Cat", s: "Faded", l: "The 2020 pop-pop meme became the first cat coin to $1B.", w: "popcat" },
  { n: "Cat in a Dogs World", t: "MEW", c: "Solana", y: 2024, m: 1000, cm: 40, g: "Cat", s: "Faded", l: "March 2024's feline answer to a market run entirely by shibas. It was briefly worth a billion dollars.", w: "cat_in_a_dogs_world" },
  { n: "Brett", t: "BRETT", c: "Base", y: 2024, m: 2300, cm: 36, g: "Character", s: "Faded", l: "Matt Furie's Boy's Club character, adopted as Base's flagship meme.", w: "brett" },
  { n: "Mog Coin", t: "MOG", c: "Ethereum", y: 2023, m: 1500, cm: 36, g: "Cat", s: "Faded", l: "The internet's first 'culture coin'. Joycat with sunglasses, $1.5B peak.", w: "mog_coin" },
  { n: "Turbo", t: "TURBO", c: "Ethereum", y: 2023, m: 1000, cm: 50, g: "Frog", s: "Alive", l: "Designed by GPT-4 on a $69 budget. The original AI-made memecoin.", w: "turbo" },
  { n: "Floki", t: "FLOKI", c: "BNB Chain", y: 2021, m: 3300, cm: 190, g: "Dog", s: "Faded", l: "Named after Elon's puppy, rebranded into a sprawling 'utility ecosystem'.", w: "floki" },
  { n: "Baby Doge Coin", t: "BABYDOGE", c: "BNB Chain", y: 2021, m: 1000, cm: 68.3, g: "Dog", s: "Faded", l: "Deflationary son-of-Doge famous for burning quadrillions of tokens.", w: "baby_doge_coin" },
  { n: "Dogelon Mars", t: "ELON", c: "Ethereum", y: 2021, m: 1100, cm: 50, g: "Dog", s: "Faded", l: "Doge, but on Mars, in 2021's most honest ticker grab.", w: null },
  { n: "Book of Meme", t: "BOME", c: "Solana", y: 2024, m: 1500, cm: 30, g: "Joke", s: "Faded", l: "Darkfarms' attempt to archive meme culture on-chain forever. Presale to $1.5B in days.", w: "book_of_meme" },
  { n: "Dog Go To The Moon", t: "DOG", c: "Bitcoin", y: 2024, m: 1000, cm: 118, g: "Dog", s: "Alive", l: "The flagship of Bitcoin Runes, etched at the 2024 halving, airdropped free.", w: "dog_go_to_the_moon" },
  { n: "PENGU", t: "PENGU", c: "Solana", y: 2024, m: 2800, cm: 450, g: "Animal", s: "Alive", l: "Pudgy Penguins' token — the NFT brand that made it out, complete with ETF filing.", w: "pengu" },
  { n: "Snek", t: "SNEK", c: "Cardano", y: 2023, m: 500, cm: 30, g: "Animal", s: "Alive", l: "Cardano's fair-launched house snake, its most valuable native token.", w: "snek" },
  { n: "SPX6900", t: "SPX", c: "Ethereum", y: 2023, m: 2100, cm: 260, g: "Joke", s: "Alive", l: "A parody of the S&P 500 that became the belief coin of the 2025 cycle.", w: "spx6900" },
  { n: "Gigachad", t: "GIGA", c: "Solana", y: 2024, m: 648, cm: 25, g: "Person", s: "Faded", l: "Ernest Khalimov's jawline, community-takeover edition.", w: "gigachad" },
  { n: "Apu Apustaja", t: "APU", c: "Ethereum", y: 2023, m: 500, cm: 5, g: "Frog", s: "Faded", l: "The gentle helper frog. A coin 'for all frens'.", w: "apu_apustaja" },
  { n: "Wojak", t: "WOJAK", c: "Ethereum", y: 2023, m: 140, cm: 16.5, g: "Character", s: "Faded", l: "The bald feels guy, tokenized in the post-PEPE shitcoin spring.", w: "wojak" },
  { n: "Milady Meme Coin", t: "LADYS", c: "Ethereum", y: 2023, m: 380, cm: 6.746, g: "Character", s: "Faded", l: "Milady Maker aesthetics plus one Elon tweet equals +5,000%.", w: "milady_meme_coin" },
  { n: "HarryPotterObamaSonic10Inu", t: "BITCOIN", c: "Ethereum", y: 2023, m: 370, cm: 40, g: "Joke", s: "Faded", l: "Absurdism as a service. Trades under the ticker BITCOIN.", w: "harrypotterobamasonic10inu" },
  { n: "Samoyedcoin", t: "SAMO", c: "Solana", y: 2021, m: 600, cm: 1.787, g: "Dog", s: "Faded", l: "Widely recognized as Solana's first memecoin, from the 2021 bull.", w: "samoyedcoin" },
  { n: "PONKE", t: "PONKE", c: "Solana", y: 2023, m: 400, cm: 30, g: "Animal", s: "Alive", l: "An angry gambling monkey, one of the longest-lived mascots of its cohort.", w: "ponke" },
  { n: "Jeo Boden", t: "BODEN", c: "Solana", y: 2024, m: 650, cm: 0.906, g: "Politics", s: "Collapsed", l: "The misspelled Biden parody that led 2024's PolitiFi wave — until Biden dropped out.", w: "jeo_boden" },
  { n: "MOTHER", t: "MOTHER", c: "Solana", y: 2024, m: 227, cm: 0.7, g: "Celebrity", s: "Faded", l: "Iggy Azalea's coin — the celebrity launch that actually kept showing up.", w: "mother" },
  { n: "Jailstool", t: "JAILSTOOL", c: "Solana", y: 2025, m: 267, cm: 5, g: "Celebrity", s: "Collapsed", l: "Dave Portnoy's nine-figure pump, crashed within days.", w: "jailstool" },
  { n: "Vine Coin", t: "VINE", c: "Solana", y: 2025, m: 500, cm: 6.733, g: "Brand", s: "Collapsed", l: "Vine's cofounder rode the do-it-for-the-Vine revival rumors to $500M.", w: "vine_coin" },
  { n: "Jelly My Jelly", t: "JELLYJELLY", c: "Solana", y: 2025, m: 250, cm: 15, g: "Brand", s: "Faded", l: "A Venmo cofounder's video-app token that later set off the Hyperliquid short-squeeze crisis.", w: "jelly_my_jelly" },
  { n: "GME on Solana", t: "GME", c: "Solana", y: 2024, m: 200, cm: 3.017, g: "Brand", s: "Faded", l: "Unaffiliated GameStop tribute that 50x'd when Roaring Kitty came back online.", w: "gme_on_solana" },
  { n: "Useless Coin", t: "USELESS", c: "Solana", y: 2025, m: 361, cm: 72, g: "Joke", s: "Alive", l: "Its only stated feature is being useless. The emblem of the anti-utility trade.", w: "useless_coin" },
  { n: "Chill Guy", t: "CHILLGUY", c: "Solana", y: 2024, m: 550, cm: 11.2, g: "Character", s: "Faded", l: "Just a chill cartoon dog, a TikTok mania, and one very unchill copyright dispute.", w: "chill_guy" },
  { n: "Retardio", t: "RETARDIO", c: "Solana", y: 2024, m: 230, cm: 1.754, g: "Joke", s: "Faded", l: "The coin whose name became trench culture's most-used word.", w: "retardio" },
  { n: "Aura", t: "AURA", c: "Solana", y: 2024, m: 230, cm: 10, g: "Joke", s: "Alive", l: "Tokenized Gen Z aura points. Ran a year after launch, unnoticed until it wasn't.", w: "aura" },
  { n: "NEET", t: "NEET", c: "Solana", y: 2025, m: 49, cm: 24, g: "Joke", s: "Alive", l: "The anti-work cult coin that funds real protests with creator revenue.", w: "neet" },
  { n: "Buttcoin", t: "BUTTCOIN", c: "Solana", y: 2025, m: 60, cm: 25, g: "Joke", s: "Alive", l: "Crypto's oldest insult, finally tradeable.", w: "buttcoin" },
  { n: "Mubarak", t: "MUBARAK", c: "BNB Chain", y: 2025, m: 200, cm: 18, g: "Character", s: "Faded", l: "Anchor of the Arabic meme wave on BSC after CZ bought in.", w: "mubarak" },
  { n: "TST", t: "TST", c: "BNB Chain", y: 2025, m: 490, cm: 15, g: "Joke", s: "Faded", l: "A throwaway example token from a BNB tutorial video. Traders made it a $490M joke.", w: "tst" },
  { n: "Broccoli", t: "BROCCOLI", c: "BNB Chain", y: 2025, m: 400, cm: 16.3, g: "Dog", s: "Faded", l: "CZ revealed his dog's name and BSC launched a hundred broccolis by dinnertime.", w: "broccoli" },
  { n: "Cheems", t: "CHEEMS", c: "BNB Chain", y: 2025, m: 170, cm: 103, g: "Dog", s: "Alive", l: "Balltze's memorial coin family — the Binance-listed flagship of Cheems lore.", w: "cheems" },
  { n: "Degen", t: "DEGEN", c: "Base", y: 2024, m: 160, cm: 33, g: "Joke", s: "Alive", l: "Farcaster's tipping token that grew its own layer-3 blockchain.", w: "degen_coin" },
  { n: "Clanker", t: "CLANKER", c: "Base", y: 2024, m: 143, cm: 12, g: "AI", s: "Alive", l: "The autonomous deployer bot that launches tokens on request. Acquired by Farcaster.", w: "clanker" },
  { n: "aixbt", t: "AIXBT", c: "Base", y: 2024, m: 800, cm: 40, g: "AI", s: "Faded", l: "The AI commentator that became CT's most-followed analyst.", w: "aixbt" },
  { n: "ai16z", t: "AI16Z", c: "Solana", y: 2024, m: 2500, cm: 0.558, g: "AI", s: "Collapsed", l: "The AI-managed VC DAO that led the agent meta, rebranded to ElizaOS, and was declared dead by its own founder.", w: "ai16z" },
  { n: "Kekius Maximus", t: "KEKIUS", c: "Solana", y: 2024, m: 77, cm: 0.076, g: "Frog", s: "Faded", l: "Pepe as a Roman gladiator; +1,700% when Musk took the name as his X persona.", w: "kekius_maximus" },
  { n: "Fwog", t: "FWOG", c: "Solana", y: 2024, m: 700, cm: 4.6, g: "Frog", s: "Faded", l: "The community rallied behind the collapsed project's unpaid artist.", w: "fwog" },
  { n: "Harambe on Solana", t: "HARAMBE", c: "Solana", y: 2024, m: 88, cm: 0.003, g: "Animal", s: "Faded", l: "A memorial coin for the gorilla, abandoned then community-revived.", w: "harambe_on_solana" },
  { n: "Tung Tung Tung Sahur", t: "TRIPLET", c: "Solana", y: 2025, m: 30, cm: 9.32, g: "Character", s: "Alive", l: "Indonesian Ramadan brainrot, now an established character coin.", w: "tung_tung_tung_sahur" },
  { n: "TROLL", t: "TROLL", c: "Solana", y: 2024, m: 283, cm: 42, g: "Character", s: "Alive", l: "Trollface lay dormant for months, then bought the actual meme rights.", w: "troll" },
  { n: "The Black Bull", t: "ANSEM", c: "Solana", y: 2026, m: 362, cm: 288, g: "Person", s: "Alive", l: "An anon handed Ansem the supply; he airdropped the fees back.", w: "the_black_bull" },
  { n: "FEFER", t: "FEFER", c: "Stable Chain", y: 2026, m: 9, cm: 6, g: "Character", s: "Alive", l: "The first memecoin on Tether's gas chain; its frenzy set network records.", w: "fefer" },
  { n: "Frong", t: "FRONG", c: "Robinhood", y: 2026, m: 12, cm: 6.2, g: "Frog", s: "Alive", l: "Minted through Uniswap's unreleased launchpad contracts six days early.", w: "frong" },
  { n: "Cash Cat", t: "CASHCAT", c: "Robinhood", y: 2026, m: 253, cm: 209, g: "Cat", s: "Alive", l: "The cat Robinhood almost named the company after — first memecoin in the Robinhood app.", w: "cash_cat" },
  { n: "Hoodrat", t: "HOODRAT", c: "Robinhood", y: 2026, m: 17, cm: 2.9, g: "Animal", s: "Alive", l: "A Night Riders-linked rat from the chain's July takeover.", w: "hoodrat" },
  { n: "Pons", t: "PONS", c: "Robinhood", y: 2026, m: 351, cm: 318, g: "Brand", s: "Alive", l: "The chain's dominant launchpad token: by late July 2026 it was handling about 54% of all transactions on it.", w: "pons" },
  { n: "TENDIES", t: "TENDIES", c: "Robinhood", y: 2026, m: 33, cm: 16, g: "Joke", s: "Alive", l: "WallStreetBets flavor for the chain's first meme summer.", w: "tendies" },
  { n: "StonkBroker", t: "STONKBROKER", c: "Robinhood", y: 2026, m: 60, cm: 50, g: "Brand", s: "Alive", l: "4,444 pixel-art PFPs, each holding its own wallet of real tokenized stocks - TSLA, AMZN, PLTR - dropped in at mint.", w: "stonkbroker" },
  { n: "Neiro", t: "NEIRO", c: "Ethereum", y: 2024, m: 1180, cm: 80, g: "Dog", s: "Faded", l: "Kabosu's successor dog sparked a coin war and a controversial double Binance listing.", w: "neiro" },
  // ── Robinhood Chain, the July 2026 wave ─────────────────────────────────
  { n: "pipedog", t: "PIPEDOG", c: "Robinhood", y: 2026, m: 74, cm: 32, g: "Dog", s: "Alive", l: "Up hundreds of times over in the chain's first weeks, then real exchange listings. The trenches' pick for Robinhood's flagship dog.", w: null },
  { n: "Little John", t: "JOHN", c: "Robinhood", y: 2026, m: 30, cm: 0.02, g: "Character", s: "Collapsed", l: "Robin Hood's right hand, tokenized on Robin Hood's blockchain.", w: null },
  { n: "YOLO", t: "YOLO", c: "Robinhood", y: 2026, m: 21, cm: 10.7, g: "Joke", s: "Alive", l: "The oldest word in retail trading, finally given a ticker on the retail-trading chain.", w: null },
  { n: "Shibinhood", t: "WOOF", c: "Robinhood", y: 2026, m: 7, cm: 0.77, g: "Dog", s: "Alive", l: "A shiba in a feathered cap. The pun wrote itself, and then somebody deployed it.", w: null },
  { n: "Vladhood", t: "VLAD", c: "Robinhood", y: 2026, m: 2.5, cm: 0.228, g: "Person", s: "Scandal", l: "Hackers took over Vlad Tenev's own X account and shilled a 46-minute-old coin as the official mascot. They left with 650 ETH.", w: null },
  { n: "Robin Hood", t: "FOX", c: "Robinhood", y: 2026, m: 8, cm: 1.8, g: "Animal", s: "Alive", l: "Disney's 1973 fox — the Robin Hood most people actually picture.", w: null },
  { n: "NASDANQ", t: "NASDANQ", c: "Robinhood", y: 2026, m: 4, cm: 2.6, g: "Joke", s: "Alive", l: "r/MemeEconomy's fictional meme stock exchange from 2017, finally listed somewhere real.", w: null },

  // ── Base ────────────────────────────────────────────────────────────────
  { n: "BASECAT", t: "BASECAT", c: "Base", y: 2026, m: 32, cm: 31, g: "Cat", s: "Alive", l: "A cream cat in a blue hard hat that Coinbase's own Base app posted in 2025. The community minted it in August 2026 and it ran 12,000%.", w: "basecat" },
  { n: "Toshi", t: "TOSHI", c: "Base", y: 2023, m: 943, cm: 58, g: "Cat", s: "Faded", l: "Brian Armstrong's cat, itself named for Satoshi. Base's first mascot and still one of its two Legends.", w: "toshi" },
  { n: "Toby ToadGod", t: "TOBY", c: "Base", y: 2024, m: 90, cm: 7.8, g: "Frog", s: "Alive", l: "The frog of Base, airdropped to 1.4 million wallets on day one. No VCs, no presale, just toadgod's prophecy.", w: null },
  { n: "Bald", t: "BALD", c: "Base", y: 2023, m: 68, cm: 13.8, g: "Person", s: "Scandal", l: "A joke about Brian Armstrong's head, launched days before Base opened. Its dev pulled the liquidity and left Base with its founding trauma.", w: "bald" },

  // ── BNB Chain, including the Chinese meme waves ─────────────────────────
  { n: "Binance Life", t: "BINANCELIFE", c: "BNB Chain", y: 2025, m: 890, cm: 506, g: "Joke", s: "Alive", a: ["币安人生"], l: "He Yi answered a joke about 'Apple Life, Android Life' and the community CTO'd 币安人生 into the biggest meme on BNB Chain.", w: null },
  { n: "Giggle Fund", t: "GIGGLE", c: "BNB Chain", y: 2025, m: 277, cm: 36, g: "Brand", s: "Faded", l: "Donates 5% of every trade to CZ's free-school project — which then publicly distanced itself from the coin.", w: null },

  // ── Elsewhere, but too recent or too good to leave out ──────────────────
  { n: "Asteroid Shiba", t: "ASTEROID", c: "Ethereum", y: 2024, m: 200, cm: 24, g: "Dog", s: "Alive", l: "A plush shiba designed by a teenage cancer patient that actually flew on Polaris Dawn. It peaked two years after launch.", w: "asteroid_shiba" },

  // ── Robinhood Chain, the 2026 expansion ──────────────────────────────────
  { n: "Goose Token", t: "GOOSE", c: "Robinhood", y: 2026, m: 133, cm: 80, g: "Animal", s: "Alive", l: "Executive Order No. 001 declares it the official currency of the Flock, under the slogan 'Make Waterfowl Great Again'; it ran 63x to a $132M peak in three days.", w: null },
  { n: "The Index", t: "INDEX", c: "Robinhood", y: 2026, m: 40, cm: 29, g: "Brand", s: "Alive", l: "A 3% fee on every trade buys Robinhood's tokenized stocks and pushes them straight into holders' wallets — a memecoin that pays its dividend in equities.", w: null },
  { n: "What IF", t: "IF", c: "Robinhood", y: 2026, m: 35, cm: 7.4, g: "Joke", s: "Alive", l: "Left for dead by its dev and taken over by one holder on 21 July 2026, it asks the hypothetical where nobody ever sells; it peaked at $35M twelve days later.", w: null },
  { n: "Chump Coin", t: "CHUMP", c: "Robinhood", y: 2026, m: 35, cm: 31, g: "Politics", s: "Alive", l: "A chicken in a suit signing executive orders from the Gold House, and going by CC21B — the last five characters of its own contract address.", w: null },
  { n: "Hookr.fun", t: "HOOKR", c: "Robinhood", y: 2026, m: 20, cm: 12, g: "Brand", s: "Alive", l: "A launchpad that bolts up to five Uniswap v4 rules — Anti-Snipe, Auto Burn, Nth-buy Pot — onto a new pool, no Solidity; $0.3M in mid-August 2026, $20M by the 31st.", w: null },
  { n: "The Juggernaut", t: "JUGGERNAUT", c: "Robinhood", y: 2026, m: 21, cm: 5.5, g: "Character", s: "Alive", l: "Asked on X in May 2025 to name his favorite meme, Vlad Tenev replied with two words; a comic-book bruiser by that name reached Robinhood Chain a year later.", w: null },
  { n: "Longbow", t: "BOW", c: "Robinhood", y: 2026, m: 9.3, cm: 5.7, g: "Brand", s: "Alive", l: "Robin Hood's weapon, repurposed as the chain's credit market: borrow dollars against your tokenized stocks instead of selling them.", w: null },
  { n: "4663", t: "4663", c: "Robinhood", y: 2026, m: 7.9, cm: 0.3, g: "Joke", s: "Faded", l: "Robinhood Chain's own EVM chain ID, minted as a token; the digits spell HOOD on a phone keypad, and in July it was named with CASHCAT among the chain's top memes.", w: null },
  { n: "Retirement Plan", t: "401K", c: "Robinhood", y: 2026, m: 3.4, cm: 0.032, g: "Joke", s: "Faded", l: "It promises holders reflections paid in tokenized Apple, Alphabet, NVIDIA and SpaceX shares: a tax-deferred American savings account, rebuilt as a memecoin.", w: null },
  { n: "Crude Cat", t: "CRUDECAT", c: "Robinhood", y: 2026, m: 3.7, cm: 1.9, g: "Cat", s: "Alive", l: "An orange tabby in a ghutra, heir to a Saudi oil empire; its deepest pool trades against a tokenized United States Oil Fund rather than against ether.", w: null },
  { n: "Vibing Cat", t: "VIBECAT", c: "Robinhood", y: 2026, m: 4.4, cm: 0.24, g: "Cat", s: "Faded", l: "Minette, filmed bobbing her head to a Jonas Blue song in an April 2020 TikTok; the Twitch emote she became was on 12,600 channels by that August.", w: null },
  { n: "Liluni", t: "LILUNI", c: "Robinhood", y: 2026, m: 5.1, cm: 2.1, g: "Character", s: "Alive", l: "Uniswap's 404 page shows a sad unicorn, and the alt text in the page source gives him a name; somebody made that name a coin in July 2026.", w: null },
  { n: "Artificial Inu", t: "AI", c: "Robinhood", y: 2026, m: 218, cm: 188, g: "Dog", s: "Alive", l: "The dog is long compute: its deepest market is quoted in tokenized NVIDIA stock, not dollars, and roughly 10,000 of those shares sit under it.", w: null },
  { n: "Boner Coin", t: "BONER", c: "Robinhood", y: 2026, m: 87, cm: 61, g: "Joke", s: "Alive", l: "Paired at its August 2026 launch against tokenized Hims & Hers stock, so buying it locks real shares into a pool that now holds most of that stock's float.", w: null },
  { n: "Memory Cow", t: "MOO", c: "Robinhood", y: 2026, m: 48, cm: 14, g: "Animal", s: "Alive", l: "An unaffiliated cattle mascot for Micron's memory supercycle, whose deepest market prices it in tokenized MU stock rather than dollars.", w: null },
  { n: "microduck", t: "MICRODUCK", c: "Robinhood", y: 2026, m: 27, cm: 15, g: "Animal", s: "Alive", l: "An unaffiliated tribute to Hugging Face's $399 open-source waddling robot, minted the day it was unveiled and quoted against tokenized NVIDIA stock.", w: null },
  { n: "QUOTRONS", t: "QUOTRON", c: "Robinhood", y: 2026, m: 64, cm: 27, g: "Brand", s: "Alive", l: "4,444 tokens, one per historic quote machine, named for the 1960 desk unit that first gave brokers prices on demand; burn one and it pays in tokenized stock.", w: null }
];
