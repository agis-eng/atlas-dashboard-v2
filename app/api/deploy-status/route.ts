import { BUILD_INFO } from "@/lib/build-info";

export async function GET() {
  const healthUrl = process.env.RAILWAY_STATIC_URL
    ? `https://${process.env.RAILWAY_STATIC_URL}/api/health`
    : process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/health`
      : null;

  let health = {
    reachable: false,
    status: "unknown",
    statusCode: null as number | null,
  };

  if (healthUrl) {
    try {
      const res = await fetch(healthUrl, {
        redirect: "manual",
        cache: "no-store",
      });
      health = {
        reachable: res.ok || res.status === 307,
        status: res.ok ? "healthy" : res.status === 307 ? "reachable-auth-redirect" : "unhealthy",
        statusCode: res.status,
      };
    } catch {
      health = {
        reachable: false,
        status: "unreachable",
        statusCode: null,
      };
    }
  }

  return Response.json({
    build: BUILD_INFO,
    railway: {
      projectName: process.env.RAILWAY_PROJECT_NAME || null,
      projectId: process.env.RAILWAY_PROJECT_ID || null,
      environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || null,
      serviceName: process.env.RAILWAY_SERVICE_NAME || null,
      serviceId: process.env.RAILWAY_SERVICE_ID || null,
      publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL || null,
    },
    health,
    versionText: `${BUILD_INFO.commit} • ${BUILD_INFO.builtAt}`,
  });
}
