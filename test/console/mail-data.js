const rawHeader =
  "To: receiver@spamscores" +
  "From: sender@spamscores" +
  "Subject: [X-Spam-Status] Spam Scores test mail" +
  "X-Spam-Report: -42.42 hits, 9 required;" +
  "  * -0.2  -- DKIM verification succeed" +
  "  * 0.18  -- Mixed characters in a message" +
  "  * 0.00  -- From is a Freemail address" +
  "            [gmx.de]" +
  "  * -0.00  -- DKIM checks completed" +
  "  * -0.01 -- Domain has working MX" +
  "  * -5.5  -- Message probably ham" +
  "Message-ID: spam-status-7";
