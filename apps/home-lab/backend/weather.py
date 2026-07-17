import httpx

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# Codes météo WMO (utilisés par Open-Meteo) -> (emoji, libellé FR)
WEATHER_CODES = {
    0: ("☀️", "Ciel dégagé"),
    1: ("🌤️", "Plutôt dégagé"),
    2: ("⛅", "Partiellement nuageux"),
    3: ("☁️", "Couvert"),
    45: ("🌫️", "Brouillard"),
    48: ("🌫️", "Brouillard givrant"),
    51: ("🌦️", "Bruine légère"),
    53: ("🌦️", "Bruine"),
    55: ("🌦️", "Bruine dense"),
    56: ("🌦️", "Bruine verglaçante"),
    57: ("🌦️", "Bruine verglaçante dense"),
    61: ("🌧️", "Pluie légère"),
    63: ("🌧️", "Pluie"),
    65: ("🌧️", "Pluie forte"),
    66: ("🌧️", "Pluie verglaçante"),
    67: ("🌧️", "Pluie verglaçante forte"),
    71: ("🌨️", "Neige légère"),
    73: ("🌨️", "Neige"),
    75: ("🌨️", "Neige forte"),
    77: ("🌨️", "Grains de neige"),
    80: ("🌦️", "Averses légères"),
    81: ("🌦️", "Averses"),
    82: ("⛈️", "Averses violentes"),
    85: ("🌨️", "Averses de neige légères"),
    86: ("🌨️", "Averses de neige fortes"),
    95: ("⛈️", "Orage"),
    96: ("⛈️", "Orage avec grêle"),
    99: ("⛈️", "Orage violent avec grêle"),
}


def describe_code(code: int) -> dict:
    emoji, label = WEATHER_CODES.get(code, ("❓", "Inconnu"))
    return {"code": code, "emoji": emoji, "label": label}


async def geocode_city(name: str) -> dict | None:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GEOCODING_URL, params={"name": name, "count": 1, "language": "fr"}
        )
        resp.raise_for_status()
        results = resp.json().get("results")
        if not results:
            return None
        r = results[0]
        return {
            "name": r["name"],
            "country": r.get("country"),
            "latitude": r["latitude"],
            "longitude": r["longitude"],
        }


async def get_forecast(latitude: float, longitude: float) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            FORECAST_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": "temperature_2m,weather_code,wind_speed_10m",
                "daily": "temperature_2m_max,temperature_2m_min,weather_code",
                "timezone": "auto",
                "forecast_days": 5,
            },
        )
        resp.raise_for_status()
        return resp.json()


def simplify_forecast(data: dict) -> dict:
    current = data.get("current", {})
    daily = data.get("daily", {})
    days = daily.get("time", [])

    return {
        "current": {
            "temperature": current.get("temperature_2m"),
            "wind_speed": current.get("wind_speed_10m"),
            **describe_code(current.get("weather_code")),
        },
        "daily": [
            {
                "date": days[i],
                "temperature_min": daily["temperature_2m_min"][i],
                "temperature_max": daily["temperature_2m_max"][i],
                **describe_code(daily["weather_code"][i]),
            }
            for i in range(len(days))
        ],
    }
