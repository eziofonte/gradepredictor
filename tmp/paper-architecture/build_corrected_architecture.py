from pathlib import Path
from html import escape
import math, zipfile
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.platypus import Frame, Paragraph
from pypdf import PdfReader, PdfWriter, Transformation
import pypdfium2 as pdfium

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output'/'corrected-system-architecture'
OUT.mkdir(parents=True,exist_ok=True)
W,H=1120,1280
figure=OUT/'figure-3-3-corrected-architecture.pdf'
c=canvas.Canvas(str(figure),pagesize=(W,H));c.setTitle('System Architecture for Academic Performance Predictor')
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title desc">','<title id="title">System Architecture for Academic Performance Predictor</title>','<desc id="desc">A web browser accesses a Flask application through a Cloudflare demo tunnel. Microsoft provides sign-in. Flask independently accesses a linear regression model and a MySQL database on the host computer.</desc>','<rect width="100%" height="100%" fill="white"/>']

def rect(x,y,w,h,fill='#ffffff',stroke='#333333',dash=False,radius=6,width=1.5):
    c.setStrokeColor(colors.HexColor(stroke));c.setFillColor(colors.HexColor(fill));c.setLineWidth(width);c.setDash([7,5] if dash else [])
    c.roundRect(x,H-y-h,w,h,radius,stroke=1,fill=1);c.setDash([])
    svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"'+(' stroke-dasharray="7 5"' if dash else '')+'/>')
def text(x,y,s,size=18,bold=False,align='middle',color='#151a20'):
    c.setFillColor(colors.HexColor(color));c.setFont('Helvetica-Bold' if bold else 'Helvetica',size)
    {'middle':c.drawCentredString,'start':c.drawString,'end':c.drawRightString}[align](x,H-y,s)
    svg.append(f'<text x="{x}" y="{y}" text-anchor="{align}" font-family="Arial,Helvetica,sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{escape(s)}</text>')
def arrow(pts,both=True):
    c.setStrokeColor(colors.HexColor('#222222'));c.setFillColor(colors.HexColor('#222222'));c.setLineWidth(2)
    p=c.beginPath();p.moveTo(pts[0][0],H-pts[0][1])
    for x,y in pts[1:]:p.lineTo(x,H-y)
    c.drawPath(p)
    svg.append('<polyline points="'+' '.join(f'{x},{y}' for x,y in pts)+'" fill="none" stroke="#222" stroke-width="2"/>')
    def head(a,b):
        ang=math.atan2(b[1]-a[1],b[0]-a[0]); n=10
        pts2=[b,(b[0]-n*math.cos(ang-.43),b[1]-n*math.sin(ang-.43)),(b[0]-n*math.cos(ang+.43),b[1]-n*math.sin(ang+.43))]
        p=c.beginPath();p.moveTo(pts2[0][0],H-pts2[0][1])
        for x,y in pts2[1:]:p.lineTo(x,H-y)
        p.close();c.drawPath(p,stroke=0,fill=1)
        svg.append('<polygon points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in pts2)+'" fill="#222"/>')
    head(pts[-2],pts[-1])
    if both:head(pts[1],pts[0])

# User and browser. Technology labels are legible vector text, not decorative logos.
rect(270,18,190,56,radius=4);text(365,53,'User',24,True)
arrow([(365,74),(365,112)])
rect(35,112,660,220,radius=4);text(365,148,'Web Browser',24,True)
rect(62,170,606,132,fill='#fbfcfe',dash=True,radius=4);text(365,200,'Frontend Layer',21,True)
for x,label,bg,fg in [(79,'HTML5','#fce9e3','#b63d19'),(225,'CSS','#e7edff','#234bb8'),(371,'JavaScript','#fff7db','#775600'),(517,'Tailwind CSS','#e2f7fa','#087388')]:
    rect(x,222,130,52,fill=bg,stroke=fg,radius=5);text(x+65,254,label,17,True,color=fg)

# Microsoft is external to the host and is involved in browser redirects and server verification.
rect(810,148,265,118,fill='#fbfcfe',radius=5)
for x,y,color in [(837,174,'#f35325'),(860,174,'#81bc06'),(837,197,'#05a6f0'),(860,197,'#ffba08')]:
    rect(x,y,18,18,fill=color,stroke=color,radius=0,width=.5)
text(972,189,'Microsoft',20,True);text(972,215,'Identity Platform',18,True);text(972,239,'Authentication service',14)
arrow([(695,216),(805,216)]);text(750,199,'Sign-in',14)

# Cloudflare quick tunnel is a temporary public access route, not an always-on system component.
rect(235,385,260,93,fill='#fff8ef',stroke='#a96119',radius=8)
text(365,418,'Cloudflare Tunnel',21,True,color='#9b4c09');text(365,445,'Temporary demo URL',16)
arrow([(365,332),(365,380)])

# The host runs the Flask app and independently accesses the model and database.
rect(35,530,660,700,radius=6);text(58,568,'Host Computer',22,True,align='start')
rect(195,608,340,118,fill='#f7f9fb',radius=6)
text(365,648,'Flask Application Server',22,True);text(365,676,'Prediction, sign-in & history',16);text(365,701,'Python / Flask',16)
arrow([(365,478),(365,603)])

# Server-to-Microsoft path remains outside the browser and host rectangles.
arrow([(535,665),(755,665),(755,315),(942,315),(942,271)])
text(762,402,'Token exchange',14,align='start');text(762,421,'& verification',14,align='start')

rect(70,895,282,221,fill='#fbfcfe',dash=True,radius=5)
text(211,930,'Machine Learning Layer',18,True)
rect(90,953,242,98,fill='#fffdf6',stroke='#b79532',radius=5)
text(211,985,'Linear Regression',19,True);text(211,1013,'Python / scikit-learn',16)
text(211,1081,'Trained on synthetic data',14);text(211,1101,'at application startup',14)

rect(382,895,282,221,fill='#fbfcfe',dash=True,radius=5)
text(523,930,'Database Layer',18,True)
rect(402,953,242,98,fill='#f4f9fd',stroke='#42749b',radius=5)
text(523,985,'MySQL (XAMPP)',19,True);text(523,1013,'acad_perf database',16)
text(523,1081,'Users, sessions & assessments',14);text(523,1101,'plus migration records',14)
arrow([(285,726),(285,818),(211,818),(211,890)])
arrow([(445,726),(445,818),(523,818),(523,890)])
text(196,851,'Predict GWA',14,align='end');text(538,851,'Read / write',14,align='start')
text(365,1190,'Local access can connect to Flask without the tunnel.',15)

c.save();svg.append('</svg>');(OUT/'figure-3-3-corrected-architecture.svg').write_text('\n'.join(svg),encoding='utf-8')
doc=pdfium.PdfDocument(str(figure));doc[0].render(scale=2.2).to_pil().save(OUT/'figure-3-3-corrected-architecture.png')

caption='Figure 3.3 System Architecture for Academic Performance Predictor'
paragraphs=[
"Figure 3.3 presents the system architecture of the Academic Performance Predictor for the Cloudflare-based demonstration setup. Users access the system through a web browser containing the frontend layer, which uses HTML5, CSS, JavaScript, and Tailwind CSS on applicable pages. The frontend presents the assessment form, predicted results, sign-in controls, and assessment history. For public demonstration, a Cloudflare Quick Tunnel provides a temporary HTTPS address that connects to the application on the host computer. When the system is accessed locally, the browser can communicate with the local server without the tunnel.",
"The Flask application server on the host computer serves the frontend, validates assessment inputs, handles prediction and history requests, and manages account sessions. For sign-in, the browser is directed to the external Microsoft Identity Platform, while the application handles the authentication response and token exchange. A guest may request an estimate without saving it to account history. A signed-in user can save successful assessments and retrieve or delete their own saved history.",
"The machine learning layer uses a Linear Regression model implemented in Python with scikit-learn. It estimates General Weighted Average (GWA) from five behavioral inputs: daily screen time, academic phone use, social media phone use, daily study hours, and weekly study frequency. Flask trains the model on synthetic data during application startup. The predicted GWA is restricted to the 1.00-5.00 range and rounded to two decimal places; the corresponding performance category is assigned using defined GWA thresholds. The result is a prototype estimate rather than an official grade.",
"The database layer uses the MySQL acad_perf database in the local XAMPP setup. It stores assessment data and results, Microsoft-linked user records, server-side sessions, and migration records. Flask communicates separately with the machine learning layer and the database layer. Overall, the architecture combines the browser-based frontend, external Microsoft authentication, the Flask application, the regression model, and the MySQL database; Cloudflare Tunnel provides temporary public access for the demonstration."
]
(OUT/'corrected-system-architecture-description.txt').write_text(caption+'\n\n'+'\n\n'.join(paragraphs)+'\n',encoding='utf-8')

# Compose the paper insert with a full vector figure followed by selectable prose.
paper=OUT/'corrected-system-architecture-and-description.pdf';base=OUT/'_layout.pdf'
pw,ph=A4;cc=canvas.Canvas(str(base),pagesize=A4)
cc.setFont('Times-Bold',14);cc.drawString(54,ph-60,'3.3 System Architecture')
scale=min((pw-108)/W,(ph-170)/H);fh=H*scale;bottom=ph-85-fh
cc.setFont('Times-Italic',11);cc.drawCentredString(pw/2,bottom-24,caption);cc.showPage()
cc.setFont('Times-Bold',12);cc.drawString(54,ph-60,'3.3 System Architecture (continued)')
style=ParagraphStyle('Body',fontName='Times-Roman',fontSize=12,leading=18,alignment=TA_JUSTIFY,firstLineIndent=26,spaceAfter=10)
story=[Paragraph(escape(p),style) for p in paragraphs]
Frame(54,54,pw-108,ph-135,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0).addFromList(story,cc)
if story:raise RuntimeError('Architecture description did not fit on one page')
cc.save();pages=PdfReader(str(base));pages.pages[0].merge_transformed_page(PdfReader(str(figure)).pages[0],Transformation().scale(scale).translate((pw-W*scale)/2,bottom))
writer=PdfWriter()
for page in pages.pages:writer.add_page(page)
writer.add_metadata({'/Title':'Corrected System Architecture for Academic Performance Predictor'})
with paper.open('wb') as stream:writer.write(stream)
base.unlink()
(OUT/'verification-notes.txt').write_text('Basis: local feature/mobile-friendly commit ecaaab32fa53bbdfb65768bd06ab033117a52de3, including acad_perf/web.py, acad_perf/predictor.py, acad_perf/history/account_history.py, acad_perf/history/database.py, scripts/demo-tunnel.bat, tools/run_local.py, and frontend HTML. The configured MySQL database schema was inspected in an earlier turn; the running mysqld executable was observed under C:\\xampp\\mysql. Cloudflare is an optional demo path; a live tunnel, Microsoft sign-in, and predictions were not tested in this task. The checked-out main branch has an older backend, so the diagram describes the newer account-based feature/mobile-friendly version.\n',encoding='utf-8')
qa=ROOT/'tmp/pdfs';qa.mkdir(parents=True,exist_ok=True)
doc=pdfium.PdfDocument(str(paper))
for i in range(len(doc)):doc[i].render(scale=1.5).to_pil().save(qa/f'corrected-architecture-page-{i+1}.png')
with zipfile.ZipFile(OUT/'corrected-system-architecture-files.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for p in OUT.iterdir():
        if p.suffix in ('.svg','.png','.pdf','.txt'):archive.write(p,p.name)
print('Created',paper,'with',len(doc),'pages')
