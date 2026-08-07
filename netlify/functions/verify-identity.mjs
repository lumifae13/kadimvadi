const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" })
    };
  }

  try {
    const { token } = JSON.parse(event.body || "{}");

    if (!token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "TOKEN_REQUIRED" })
      };
    }

    const response = await fetch(
      "https://phone-gw.downtownrpg.com/api/identity/verify",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.DOWNTOWN_SERVICE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.valid) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          valid: false,
          code: result.code || "IDENTITY_INVALID"
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        characterId: result.characterId,
        appPackageId: result.appPackageId,
        phoneNumber: result.phoneNumber,
        expiresAt: result.expiresAt
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "SERVER_ERROR" })
    };
  }
}
