const lookupState = {
  loading: false,
  results: [
    {
      personId,
      name,
      foundDeathDate,     // ISO
      source,             // "wiki" | "google" | "news"
      confidence,         // "high" | "medium" | "low"
      flagged: false      // eksisterende flag i people
    }
  ]
};
