import server from "@/modules";
import { env } from "bun";

server.listen(env.PORT ?? 3000, () => {
  console.log(
    `Server running on http://localhost:${env.PORT || 3000}${env.SERVER_PATH || ""}`,
  );
});
