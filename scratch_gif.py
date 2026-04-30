from PIL import Image, ImageSequence
import math

input_path = "public/logo.png"

img = Image.open(input_path).convert("RGBA")
base_size = 120
img = img.resize((base_size, base_size), Image.Resampling.LANCZOS)
bg_color = (15, 23, 42, 255) # #0f172a navy color or transparent

frames = []
num_frames = 30
for i in range(num_frames):
    progress = math.sin((i / num_frames) * math.pi)
    scale = 1.0 - (0.08 * progress)
    
    new_size = int(base_size * scale)
    resized = img.resize((new_size, new_size), Image.Resampling.LANCZOS)
    
    frame = Image.new("RGBA", (base_size, base_size), bg_color)
    offset = ((base_size - new_size) // 2, (base_size - new_size) // 2)
    frame.paste(resized, offset, mask=resized)
    frames.append(frame)

output_path = "public/logo-animated.gif"
frames[0].save(
    output_path,
    save_all=True,
    append_images=frames[1:],
    duration=60, # ~16 fps
    loop=0
)
print(f"Created {output_path}")

import base64
with open(output_path, "rb") as f:
    b64 = base64.b64encode(f.read()).decode("utf-8")

html = f'''<!DOCTYPE html>
<html>
<head>
<style>
body {{ padding: 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #334155; }}
h2 {{ color: #0F172A; }}
.sig-container {{ background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); margin-bottom: 40px; display: inline-block; }}
</style>
</head>
<body>

<h2>1. Main Signature (For New Emails)</h2>
<p>Highlight the contents inside the white box to copy into your Gmail signature.</p>
<div class="sig-container">
<!-- BEGIN MAIN SIGNATURE -->
<table cellpadding="0" cellspacing="0" border="0" style="font-size: 14px; text-align: left; color: #334155; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <tr>
    <td valign="center" style="padding-right: 18px; border-right: 2px solid #54D69D;">
      <a href="https://paybacker.co.uk" target="_blank" style="text-decoration:none;">
        <img src="data:image/gif;base64,{b64}" width="70" height="70" alt="Paybacker Logo" style="display: block; border-radius: 12px; width: 70px; height: 70px; border: 0;" />
      </a>
    </td>
    <td valign="center" style="padding-left: 18px;">
      <strong style="color: #0F172A; font-size: 16px;">Paul</strong><br />
      <span style="color: #54D69D; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Founder & CEO</span>
      <br />
      <div style="margin-top: 5px; font-size: 13px;">
        <p style="margin: 0;">
          <a href="https://paybacker.co.uk" style="color: #0F172A; text-decoration: none; font-weight: 600;">paybacker.co.uk</a> 
          <span style="margin: 0 6px; color: #CBD5E1;">|</span>
          <span style="color: #64748B;">AI-Powered Consumer Rights</span>
        </p>
      </div>
    </td>
  </tr>
</table>
<!-- END MAIN SIGNATURE -->
</div>

<h2>2. Reply Signature (For Email Replies)</h2>
<p>Highlight the contents inside the white box to copy into your Gmail reply signature.</p>
<div class="sig-container">
<!-- BEGIN REPLY SIGNATURE -->
<table cellpadding="0" cellspacing="0" border="0" style="font-size: 13px; text-align: left; line-height: 1.4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <tr>
    <td valign="center">
      <strong style="color: #0F172A;">Paul</strong> 
      <span style="color: #CBD5E1; margin: 0 4px;">|</span> 
      <a href="https://paybacker.co.uk" style="color: #54D69D; text-decoration: none; font-weight: 700;">paybacker.co.uk</a>
      <br />
      <span style="color: #64748B; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Founder & CEO</span>
    </td>
  </tr>
</table>
<!-- END REPLY SIGNATURE -->
</div>

</body>
</html>'''

with open("email-signature.html", "w") as f:
    f.write(html)
print("Updated email-signature.html with both signatures.")
