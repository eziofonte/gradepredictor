from pathlib import Path
from html import escape
import math
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Paragraph, Frame
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output' / 'paper-architecture'
OUT.mkdir(parents=True, exist_ok=True)
W, H = 780, 1080
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title desc">',
       '<title id="title">Academic Performance Predictor system architecture</title>',
       '<desc id="desc">A user accesses a browser frontend built with HTML, CSS and JavaScript. A Cloudflare Tunnel public URL connects the browser to a Flask server on the host computer. Flask uses a Linear Regression model and a MySQL database.</desc>',
       '<rect width="100%" height="100%" fill="white"/>']
diagram_pdf = OUT / 'figure-3-3-system-architecture.pdf'
c = canvas.Canvas(str(diagram_pdf), pagesize=(W, H))
c.setTitle('Figure 3.3 System Architecture for Academic Performance Predictor')

def box(x,y,w,h,fill='#FFFFFF',dash=False,radius=7):
    c.setStrokeColor(colors.HexColor('#222222'))
    c.setFillColor(colors.HexColor(fill))
    c.setLineWidth(1.35)
    c.setDash([6,4] if dash else [])
    c.roundRect(x,H-y-h,w,h,radius,stroke=1,fill=1)
    c.setDash([])
    svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="#222" stroke-width="1.35"'+(' stroke-dasharray="6 4"' if dash else '')+'/>')

def text(x,y,s,size=16,bold=False,align='middle'):
    font = 'Helvetica-Bold' if bold else 'Helvetica'
    c.setFont(font,size)
    c.setFillColor(colors.black)
    fn = {'middle': c.drawCentredString,'start':c.drawString,'end':c.drawRightString}[align]
    fn(x,H-y,s)
    svg.append(f'<text x="{x}" y="{y}" text-anchor="{align}" font-family="Arial, Helvetica, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="#000">{escape(s)}</text>')

def lines(x,y,items,size=15,leading=21,bold=False):
    for i,s in enumerate(items): text(x,y+i*leading,s,size,bold)

def arrow(points,both=False):
    c.setStrokeColor(colors.HexColor('#222222')); c.setFillColor(colors.HexColor('#222222')); c.setLineWidth(1.5)
    p=c.beginPath(); p.moveTo(points[0][0],H-points[0][1])
    for x,y in points[1:]: p.lineTo(x,H-y)
    c.drawPath(p)
    svg.append('<polyline points="'+' '.join(f'{x},{y}' for x,y in points)+'" fill="none" stroke="#222" stroke-width="1.5"/>')
    def head(a,b):
        angle=math.atan2(b[1]-a[1],b[0]-a[0]); length=8; spread=0.47
        coords=[b,(b[0]-length*math.cos(angle-spread),b[1]-length*math.sin(angle-spread)),(b[0]-length*math.cos(angle+spread),b[1]-length*math.sin(angle+spread))]
        p=c.beginPath(); p.moveTo(coords[0][0],H-coords[0][1])
        for x,y in coords[1:]:p.lineTo(x,H-y)
        p.close();c.drawPath(p,stroke=0,fill=1)
        svg.append('<polygon points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in coords)+'" fill="#222"/>')
    head(points[-2],points[-1])
    if both:head(points[1],points[0])

# Simplified component diagram with names only.
box(285,20,210,58)
text(390,57,'User',23,True)
arrow([(390,78),(390,119)],both=True)

box(130,120,520,192)
text(390,155,'Web Browser',23,True)
box(155,178,470,108,dash=True)
text(390,208,'Frontend Layer',20,True)
for x,label in [(175,'HTML5'),(325,'CSS'),(475,'JavaScript')]:
    box(x,228,130,40)
    text(x+65,254,label,17)

arrow([(390,312),(390,359)],both=True)
box(230,360,320,82)
lines(390,393,['Cloudflare Tunnel','Generated Public URL'],21,27,bold=True)

box(130,485,520,540,radius=12)
text(155,516,'Host Computer',19,True,align='start')
box(230,536,320,66)
text(390,577,'Flask Server',23,True)
arrow([(390,442),(390,535)],both=True)

arrow([(390,602),(390,650)],both=True)
box(180,651,420,140,dash=True)
text(390,686,'Machine Learning Layer',21,True)
box(230,710,320,56)
text(390,746,'Linear Regression',22,True)

box(180,865,420,122,dash=True)
text(390,899,'Database Layer',21,True)
box(230,919,320,46)
text(390,949,'MySQL  |  acad_perf',20)
arrow([(230,569),(155,569),(155,942),(180,942)],both=True)
svg.append('</svg>')
c.save()
(OUT/'figure-3-3-system-architecture.svg').write_text('\n'.join(svg),encoding='utf-8')

paragraphs = [
"Figure 3.3 presents the system architecture of the Academic Performance Predictor, designed for web access through a Cloudflare-generated public URL. Users interact with the system through a web browser. The Frontend Layer uses HTML5, CSS, and JavaScript to provide the assessment form, prediction results, and assessment history. Cloudflare Tunnel connects the public URL to the Flask server running on the host computer. The Flask server serves the frontend, validates submitted assessment data, and coordinates prediction and database operations. The Machine Learning Layer uses a single Linear Regression model to estimate the student's numeric General Weighted Average (GWA) from five inputs: daily screen time, academic phone use, social media or entertainment phone use, daily study hours, and weekly study frequency. The predicted GWA is limited to the 1.00-5.00 range and rounded to two decimal places. The system then assigns the corresponding performance category of Excellent, Good, Satisfactory, or Failing using defined GWA thresholds. The Database Layer uses the MySQL acad_perf database to store assessment inputs, predicted GWA, performance category, and timestamp for later retrieval. Flask handles communication with both the model and the database. The model currently trains on synthetic data during application startup. Overall, the architecture combines a browser-based frontend, Cloudflare Tunnel, a Flask application, a single regression model, and a relational database to support web-accessible academic performance prediction."
]
caption = 'Figure 3.3 System Architecture for Academic Performance Predictor'
(OUT/'updated-system-architecture-description.txt').write_text(caption+'\n\n'+'\n\n'.join(paragraphs)+'\n',encoding='utf-8')

# Compose the paper insert from the vector figure and selectable prose.
from reportlab.lib.utils import ImageReader
from pypdf import PdfWriter, Transformation
paper = OUT/'updated-system-architecture.pdf'
base = OUT/'_paper_layout.pdf'
pw,ph=A4
cc=canvas.Canvas(str(base),pagesize=A4)
cc.setTitle('Academic Performance Predictor System Architecture')
cc.setFont('Times-BoldItalic',12)
cc.drawCentredString(pw/2,67,caption)
cc.showPage()
cc.setFont('Times-Bold',14);cc.drawString(54,ph-61,'System Architecture')
style=ParagraphStyle('PaperBody',fontName='Times-Roman',fontSize=12,leading=18,alignment=TA_JUSTIFY,spaceAfter=12)
story=[Paragraph(p,style) for p in paragraphs]
frame=Frame(54,54,pw-108,ph-135,leftPadding=0,bottomPadding=0,rightPadding=0,topPadding=0)
frame.addFromList(story,cc)
if story:raise RuntimeError('Description overflowed its page')
cc.save()
writer=PdfWriter(); reader=PdfReader(str(base))
scale=(pw-108)/W
reader.pages[0].merge_transformed_page(PdfReader(str(diagram_pdf)).pages[0],Transformation().scale(scale).translate(54,103))
for page in reader.pages:writer.add_page(page)
writer.add_metadata({'/Title':'Academic Performance Predictor System Architecture','/Subject':'Figure 3.3 and updated architecture description'})
with paper.open('wb') as f:writer.write(f)
base.unlink()
print(f'Created {paper}')
print(f'Description: {sum(len(p.split()) for p in paragraphs)} words')
print('Pages:',len(PdfReader(str(paper)).pages))
