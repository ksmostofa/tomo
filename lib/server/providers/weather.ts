export type CurrentWeather = {
  time: string;
  temperature: number;
  apparentTemperature: number;
  precipitation: number;
  weatherCode: number;
  isDay: boolean;
  guidance: string;
};

type OpenMeteoResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    is_day?: number;
  };
};

export async function getCurrentWeather(latitude: number, longitude: number): Promise<CurrentWeather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,weather_code,is_day");
  url.searchParams.set("timezone", "auto");
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json() as OpenMeteoResponse;
  const current = payload.current;
  if (!response.ok || !current?.time || typeof current.temperature_2m !== "number") throw new Error(`Weather request failed (${response.status})`);
  const apparent = current.apparent_temperature ?? current.temperature_2m;
  const precipitation = current.precipitation ?? 0;
  const guidance = precipitation > 0
    ? "It is raining. Please take an umbrella."
    : apparent >= 30
      ? "It is very hot. Please take water and avoid staying outside too long."
      : apparent <= 8
        ? "It is cold. Please take a warm layer."
        : "Conditions are comfortable for going outside.";
  return {
    time: current.time,
    temperature: current.temperature_2m,
    apparentTemperature: apparent,
    precipitation,
    weatherCode: current.weather_code ?? 0,
    isDay: current.is_day === 1,
    guidance,
  };
}
