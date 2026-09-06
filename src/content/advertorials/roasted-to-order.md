---
title: "[HEADLINE] — Harvey's Coffee"
draft: false
primary: true
description: "[ONE SENTENCE, ~155 CHARACTERS. THIS IS THE LINK PREVIEW TEXT.]"
ogImage: /og.jpg
noindex: true

kicker: "[KICKER — e.g. Roasted To Order / Single Origin Subscription]"
headline: "[HEADLINE. One idea, phrased as a question or a claim. Atlas used \"Is this the most delicious K-cup ever made?\" Yours should be about freshness or origin — the two things you can back harder than anyone.]"
dek: "[SUBHEAD. One sentence that adds a specific fact the headline didn't — a place, a number, a timeline. Not a restatement of the headline.]"
author: "[AUTHOR NAME]"
date: 2026-09-06
readingTime: "[X] min read"

cta:
  offer: "[OFFER LINE — name the bundle. e.g. “Free Origin Card & Brew Guide + [X]% Off Your First Shipment”]"
  urgency: "[URGENCY LINE — why now. “Roasted in small batches; we cap how many go out each week” beats a fake countdown, and it's true.]"
  button: "TAKE THE QUIZ"
  sub: "[5 questions · about 60 seconds · no card required to see your match]"
  # Leave empty and no guarantee line renders. Fill it in only once the
  # refund policy actually says the same thing.
  risk: ""
  bullets:
    - "[Cancel anytime]"
    - "[Roast date on every bag]"
    - "[Skip or reschedule any delivery]"
    - "[Free shipping]"
    - "[Roasted in Davis, CA]"
  destination: quiz

sticky:
  title: "[SHORT OFFER — 5 words max]"
  sub: "[5 questions · 60 seconds]"

blocks:
  # ---- BEAT 1: origin. A place, a farm, a harvest. No product yet. ----
  - type: photo
    shape: wide
    note: "Green coffee, a burlap sack, or the hills at origin. Whatever puts the reader somewhere before the selling starts."
    caption: "[CAPTION — where this is and what's happening.]"

  - type: prose
    lead: true
    body: |
      [OPENING PARAGRAPH. Start at origin — the farm, the region, the harvest.
      Describe the place and the people. Don't mention a subscription, a price
      or a website yet. The disclosure bar at the top has already told the
      reader this is an ad; you don't need to sell in the first line.]

      [SECOND PARAGRAPH. Elevation, process, harvest year. Concrete and
      checkable. Facts are what make this readable instead of promotional.]

      [THIRD PARAGRAPH. The importer or co-op, and how the lot reached you.
      Most coffee brands skip this paragraph. It's the one that makes
      everything after it believable.]

  - type: cta

  # ---- BEAT 2: the specific failure. One mechanism, one number. ----
  - type: prose
    heading: "[SECTION HEADING — name the specific failure. e.g. \"The bag in your cupboard was roasted [X] months ago.\"]"
    body: |
      [Explain the mechanism, not the vibe. Roast date versus best-by date.
      How long a bag sits in a warehouse, then on a shelf. Why "best by" tells
      you nothing about when it was roasted.]

      [The consequence in the cup, in plain language. What staling actually
      does to flavour — and why it's the reason most people think they don't
      like coffee without sugar in it.]

  - type: compare
    label: "[TABLE LABEL — e.g. What you're actually comparing]"
    themHeading: "[Supermarket bag]"
    usHeading: "Harvey's subscription"
    rows:
      - label: "Roast date on the bag"
        them: "[Rarely printed]"
        us: "[Printed on every bag]"
      - label: "Roasted before or after you order"
        them: "Months before"
        us: "After"
      - label: "Time from roast to your door"
        them: "[X–Y months]"
        us: "[X days]"
      - label: "Origin named"
        them: "[Blend, region unstated]"
        us: "Single farm, single lot"
      - label: "Matched to how you brew"
        them: "[One grind, take it or leave it]"
        us: "Ground for your brewer, or whole bean"
      - label: "Runs out"
        them: "[You notice on a Monday]"
        us: "Arrives before you're empty"

  - type: pullquote
    text: "[PULL QUOTE. The one sentence you'd want someone to remember if they read nothing else. Short enough to say out loud.]"

  # ---- BEAT 3: the fix. The subscription appears here. ----
  - type: prose
    heading: "[SECTION HEADING — the fix, stated simply. e.g. \"We don't roast it until you order it.\"]"
    body: |
      [How it actually works at your end. You roast in Davis, in small batches,
      to order. Say the real numbers — batch size, roast days, how a week runs.
      The smallness is the selling point, not something to hide behind.]

  - type: steps
    items:
      - title: "[STEP 1 — Take the quiz]"
        body: "[One sentence. What it asks and how long it takes.]"
      - title: "[STEP 2 — We match and roast]"
        body: "[One sentence. Include the real day count from order to roast.]"
      - title: "[STEP 3 — It arrives, then keeps arriving]"
        body: "[One sentence. Delivery window, and how often the next one comes.]"

  - type: photo
    note: "The roaster running — beans in the drum, or the dump into the cooling tray. This is the photo that proves the whole page. Phone quality is fine."
    caption: "[CAPTION — the roast, the batch size, the date.]"

  - type: prose
    body: |
      [What a subscriber gets that a shelf can't give them. Roast date printed.
      Ground for their brewer. The person who roasted it answers the emails.]

  - type: cta

  # ---- BEAT 4: the match. The quiz does the picking. ----
  - type: prose
    heading: "[SECTION HEADING — e.g. \"You don't have to know what you like yet.\"]"
    body: |
      [The objection you're answering: people don't subscribe to coffee because
      they don't trust themselves to pick. Explain that the quiz does the
      picking — how you brew, how strong, how often, how much.]

      [What the range covers, in plain English. Not tasting-note jargon. "If you
      take it with milk, you get X. If you drink it black, you get Y."]

  - type: quizcard
    heading: "[What the quiz asks]"
    time: "[5 questions · about 60 seconds]"
    questions:
      - "[How do you brew it?]"
      - "[How do you take it — black, milk, sweet?]"
      - "[How many cups a day?]"
      - "[Light, medium or dark — or \"no idea\"?]"
      - "[Whole bean or ground?]"
    footnote: "[One line on what happens at the end — e.g. \"You get a coffee, a grind and a delivery schedule. Change any of it later.\"]"

  - type: photo
    shape: tall
    width: inset
    note: "The bag, front-on and readable — roast date visible if you can. Then one in-hand or beside a brewed cup."
    caption: "[CAPTION — what's in the bag and what a shipment looks like.]"

  # ---- BEAT 5: credibility. Real outlets, real sentences. ----
  - type: press
    label: "As covered by"
    items:
      - outlet: "ABC10"
        quote: "[PASTE THE ACTUAL SENTENCE FROM THE ABC10 PIECE — quote it, don't paraphrase.]"
        url: "https://www.abc10.com/article/news/local/davis/davis-teen-honors-fathers-legacy-through-growing-coffee-business/103-ef62b1a4-9100-4616-afdd-7d1a9e07195c"
        linkText: "Watch the segment →"
      - outlet: "The Sacramento Bee"
        quote: "[PASTE THE ACTUAL SENTENCE FROM THE SAC BEE PIECE.]"
        url: "https://www.sacbee.com/food-drink/restaurants/article316083196.html"
        linkText: "Read the article →"
      - outlet: "Comstock's Magazine"
        quote: "[PASTE THE ACTUAL SENTENCE FROM THE COMSTOCK'S PIECE.]"
        url: "https://www.comstocksmag.com/article/what-it-takes-start-sacramento-food-business-turning-25"
        linkText: "Read the article →"

  - type: cta

  # ---- BEAT 6: the story. Late, on purpose. ----
  - type: prose
    heading: "[SECTION HEADING — the story, in your own words.]"
    body: |
      [Write this yourself, first person, and don't over-polish it. Why the
      business exists and what it's for. How much you say is your call — but
      this is the part the press led with every single time, and it's the part
      no competitor can copy.]

  - type: photo
    width: inset
    note: "Face, in the roasting setup. Not a logo, not a stock photo of beans. The page is asking a stranger to trust a person with a recurring payment."
    caption: "[CAPTION — who this is and where.]"

  # Real reviews only. Delete the items and the block renders nothing.
  - type: reviews
    heading: "[REVIEWS HEADING — remove the items below if you don't have real ones yet]"
    items: []

  - type: prose
    heading: "[CLOSING HEADING — compress the whole page to two words. Atlas lands on \"source and freshness.\" Yours probably does too.]"
    body: |
      [Two or three sentences. Restate the argument, not the offer. Let the
      final CTA carry the offer.]

  - type: cta
    variant: final

  - type: faq
    heading: "Questions"
    items:
      - q: "[Can I cancel? How?]"
        a: "[Answer first, in one sentence. Then say exactly where the button is. This is the number one reason people don't subscribe — answer it without hedging.]"
      - q: "[How often does it come, and can I change that?]"
        a: "[Real frequencies and prices per shipment. Say whether you can skip or push a delivery back.]"
      - q: "[What if I don't like the coffee I'm matched with?]"
        a: "[What you actually do. This answer must match your refund policy page word for word.]"
      - q: "[How fresh is it, exactly?]"
        a: "[Answer with a number, not an adjective. Days from roast to door.]"
      - q: "[Whole bean or ground?]"
        a: "[The grinds you offer and which brewer each one suits.]"
      - q: "[Shipping — cost and speed?]"
        a: "[Real numbers. State the threshold if free shipping is conditional.]"
---
