import server from "@/modules";
import { env } from "bun";

// "::" listens on IPv6 and IPv4 alike; Railway's private network is IPv6-only.
server.listen({ port: env.PORT ?? 3000, hostname: env.HOST ?? "::" }, () => {
  console.log(
    `Server running on http://localhost:${env.PORT || 3000}${env.SERVER_PATH || ""}`,
  );
});
