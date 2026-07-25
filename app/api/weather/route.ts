import { RouteError, routeError } from "@/lib/server/http";
import { getCurrentWeather } from "@/lib/server/providers/weather";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const latitude = Number(url.searchParams.get("latitude") ?? "35.6762");
    const longitude = Number(url.searchParams.get("longitude") ?? "139.6503");
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new RouteError(400, "latitude is invalid");
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new RouteError(400, "longitude is invalid");
    return Response.json({ weather: await getCurrentWeather(latitude, longitude), provider: "open-meteo" }, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    return routeError(error);
  }
}
