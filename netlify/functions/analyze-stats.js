// netlify/functions/analyze-stats.js

export default async (req, context) => {
  // 1. Hantera CORS (Låter din webbsida prata med servern)
  if (req.method === "OPTIONS") {
    return new Response("OK", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  // 2. Kontrollera att det är ett POST-anrop
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    // 3. Hämta API-nyckel
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("Saknar API-nyckel");
      return new Response(
        JSON.stringify({ error: "Ingen API-nyckel konfigurerad." }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Läs in datan från anropet
    const body = await req.json();
    const { prompt, data } = body;

    // Förbered data-strängen
    const dataString =
      data && Array.isArray(data)
        ? data
            .map(
              (t) =>
                `${t.date || "N/A"}, ${t.item}, ${t.type}, ${t.size}, ${t.dept}`
            )
            .join("\n")
        : "Ingen data tillgänglig.";

    // Instruktion till AI:n (System Prompt)
    const systemPrompt = `
      Du är en hjälpsam AI-assistent för "Klädappen", ett lagersystem för VGR (Sjukhus).
      Din uppgift är att analysera statistik över kläduttag.
      
      KONTEXT OM PLAGG:
      - Vanliga kläder (Jackor, Byxor etc.) finns BARA som "Dam" eller "Herr".
      - "Skor" och "Strumpor" finns BARA som "Unisex".
      
      Här är datan (Datum, Plagg, Typ, Storlek, Avdelning):
      ---
      ${dataString}
      ---
      
      Svara på användarens fråga baserat ENDAST på datan ovan.
      Var kortfattad, professionell och trevlig. Använd markdown för fetstil osv.
      Om datan är tom, säg att det inte finns någon statistik att analysera för det valda urvalet.
    `;

    // 4. Anropa Google Gemini API med timeout
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    // Sätt en timeout på 25 sekunder (Netlify har 26s gräns)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let googleResponse;
    try {
      googleResponse = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt + "\n\nAnvändarens fråga: " + prompt },
              ],
            },
          ],
        }),
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      // Hantera timeout specifikt
      if (fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            error: "AI-tjänsten svarade inte i tid. Försök igen.",
          }),
          {
            status: 504,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
      throw fetchError;
    }

    clearTimeout(timeoutId);

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text();
      console.error("Gemini API Error:", googleResponse.status, errorText);

      let userMessage = `AI-tjänsten svarade med fel (${googleResponse.status}).`;
      if (googleResponse.status === 429) {
        userMessage = "AI-tjänsten är överbelastad just nu. Vänta en stund och försök igen.";
      } else if (googleResponse.status === 403) {
        userMessage = "API-nyckeln saknar behörighet. Kontakta administratören.";
      } else if (googleResponse.status === 404) {
        userMessage = "AI-modellen kunde inte hittas. Kontakta administratören.";
      }

      return new Response(
        JSON.stringify({
          error: userMessage,
          details: errorText,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const result = await googleResponse.json();

    // 5. Plocka ut svaret
    const answer =
      result.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Inget svar kunde genereras.";

    return new Response(JSON.stringify({ answer }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Serverfel:", error);
    return new Response(
      JSON.stringify({
        error: "Tekniskt fel på servern. Försök igen om en stund.",
        details: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
};

