# Temporary panel demo on your PC

This setup runs the app and MySQL on your PC and uses a free Cloudflare Quick
Tunnel to provide a public HTTPS address. Your PC and internet connection must
remain on. This is intended for a short demo, not public production hosting.
Anyone with the link can reach the app; history still requires a PLM sign-in.
Use sample assessment data and verify privacy with two accounts before inviting
people to enter sensitive data.

## One-time preparation

1. Confirm local sign-in, MySQL, and assessment history work. The database stays
   on this PC; back it up before the demo. See `DEPLOYMENT.md` for backups and
   the production checklist.
2. Install Cloudflare's `cloudflared` for Windows using the instructions at
   https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/
   and reopen any terminal after installation. The executable must be on PATH.
3. Ensure port 5000 is free. Stop `dev-server.bat` or the separate Microsoft
   sign-in check before starting the demo.

## Each demo session

1. Start `demo-tunnel.bat`. Copy the complete `https://...trycloudflare.com`
   address printed in its window. Keep the window open.
2. In Microsoft Entra, open your app registration, select **Authentication**,
   and add a **Web** redirect URI consisting of that address followed by
   `/auth/callback`. Save it. Keep your existing localhost URI. Microsoft may
   take a few minutes to apply the change.
3. Start `demo-server.bat`, paste the tunnel address when asked, then enter the
   Microsoft client secret **Value** at the prompt. It appears on screen so you
   can check your paste; keep the terminal private and do not share screenshots
   showing the secret or place it in the tunnel URL.
4. Open the HTTPS address on your PC and a separate device. Sign in, submit a
   sample assessment, and confirm it appears in History. Share the address with
   the panel only after checking it. Keep both windows open and prevent your PC
   from sleeping for the duration of the demo.
5. Close both windows after the demo. Remove outdated temporary redirect URIs
   from the app registration to keep it tidy. A new tunnel usually produces a
   different address, requiring a new URI and server restart.

If Microsoft reports `AADSTS50011`, check that the exact HTTPS address plus
`/auth/callback` is registered as a Web redirect URI and allow time for the
change to propagate. If the tunnel shows a gateway error, confirm that the demo
server is running on port 5000. The localhost address only works on your PC;
panelists must use the HTTPS tunnel address.

Quick Tunnels are temporary and Cloudflare does not guarantee availability. Do
not expose the separate sign-in-check program through the tunnel. For a public
launch use the production setup in `DEPLOYMENT.md`, including stable hosting,
scheduled backups, and the two-user privacy pilot.
