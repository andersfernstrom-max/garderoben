// check-models.js
// Byt ut mot din nyckel om du kör lokalt utan environment variables
const apiKey = process.env.GEMINI_API_KEY;

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

console.log("Hämtar lista över tillgängliga modeller...");

fetch(url)
  .then((response) => {
    if (!response.ok) {
      throw new Error(
        `Fel vid hämtning: ${response.status} ${response.statusText}`
      );
    }
    return response.json();
  })
  .then((data) => {
    if (!data.models) {
      console.log("Inga modeller hittades.");
      return;
    }

    console.log("\n--- TILLGÄNGLIGA MODELLER (som kan generera innehåll) ---");
    const contentModels = data.models
      .filter((m) => m.supportedGenerationMethods.includes("generateContent"))
      .map(
        (m) => `Namn: ${m.name.replace("models/", "")}\n    (${m.displayName})`
      ); // Snyggare utskrift

    console.log(contentModels.join("\n"));
  })
  .catch((err) => console.error("Kunde inte hämta modeller:", err.message));
