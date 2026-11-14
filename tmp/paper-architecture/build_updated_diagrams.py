from pathlib import Path
from html import escape
import math
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Paragraph, Frame
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY
from pypdf import PdfReader, PdfWriter, Transformation
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output' / 'paper-diagrams'
OUT.mkdir(parents=True, exist_ok=True)

class Figure:
    def __init__(self, name, w, h):
        self.name, self.w, self.h = name, w, h
        self.path = OUT / (name + '.pdf')
        self.c = canvas.Canvas(str(self.path), pagesize=(w, h))
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><rect width="100%" height="100%" fill="white"/>']
    def box(self,x,y,w,h,fill='#ffffff',radius=0):
        c=self.c;c.setLineWidth(1);c.setStrokeColor(colors.HexColor('#333333'));c.setFillColor(colors.HexColor(fill))
        c.roundRect(x,self.h-y-h,w,h,radius,stroke=1,fill=1)
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="#333"/>')
    def text(self,x,y,s,size=15,bold=False,align='start',italic=False):
        font='Times-Bold' if bold else ('Times-Italic' if italic else 'Times-Roman')
        self.c.setFont(font,size);self.c.setFillColor(colors.black)
        {'start':self.c.drawString,'middle':self.c.drawCentredString,'end':self.c.drawRightString}[align](x,self.h-y,s)
        self.svg.append(f'<text x="{x}" y="{y}" text-anchor="{align}" font-family="Times New Roman,serif" font-size="{size}" font-weight="{700 if bold else 400}" font-style="{"italic" if italic else "normal"}">{escape(s)}</text>')
    def line(self,pts,arrow=False):
        c=self.c;c.setStrokeColor(colors.HexColor('#222222'));c.setLineWidth(1.4)
        p=c.beginPath();p.moveTo(pts[0][0],self.h-pts[0][1])
        for x,y in pts[1:]:p.lineTo(x,self.h-y)
        c.drawPath(p)
        self.svg.append('<polyline points="'+' '.join(f'{x},{y}' for x,y in pts)+'" fill="none" stroke="#222" stroke-width="1.4"/>')
        if arrow:
            a,b=pts[-2:];ang=math.atan2(b[1]-a[1],b[0]-a[0]);tri=[b,(b[0]-8*math.cos(ang-.45),b[1]-8*math.sin(ang-.45)),(b[0]-8*math.cos(ang+.45),b[1]-8*math.sin(ang+.45))]
            c.setFillColor(colors.HexColor('#222222'));p=c.beginPath();p.moveTo(tri[0][0],self.h-tri[0][1])
            for x,y in tri[1:]:p.lineTo(x,self.h-y)
            p.close();c.drawPath(p,stroke=0,fill=1)
            self.svg.append('<polygon points="'+' '.join(f'{x},{y}' for x,y in tri)+'" fill="#222"/>')
    def save(self):
        self.c.save();self.svg.append('</svg>');(OUT/(self.name+'.svg')).write_text('\n'.join(self.svg),encoding='utf-8')
        doc=pdfium.PdfDocument(str(self.path));doc[0].render(scale=2.4).to_pil().save(OUT/(self.name+'.png'))

f=Figure('figure-3-4-conceptual-framework',760,400)
f.box(20,25,300,350,'#edf4fc');f.box(20,25,300,44,'#78b4df')
f.text(170,53,'Independent Variables',19,True,'middle')
f.box(40,85,260,143);f.text(55,110,'Cellphone Usage',17,True)
for i,s in enumerate(['Daily screen time (hours/day)','Academic phone use (hours/day)','Social media / entertainment','phone use (hours/day)']):f.text(55,137+i*23,s,15)
f.box(40,245,260,110);f.text(55,272,'Study Habits',17,True)
f.text(55,300,'Daily study hours (hours/day)',15)
f.text(55,326,'Weekly study frequency (days/week)',15)
f.box(470,140,270,135,'#edf4fc');f.box(470,140,270,44,'#89d24c')
f.text(605,168,'Dependent Variable',19,True,'middle')
f.box(490,200,230,57);f.text(605,223,'Academic Performance',17,True,'middle')
f.text(605,245,'General Weighted Average (GWA)',14,False,'middle')
f.line([(320,156),(388,156),(388,208)])
f.line([(320,300),(388,300),(388,208)])
f.line([(388,208),(470,208)],arrow=True);f.save()

e=Figure('figure-3-5-entity-relationship-diagram',850,740)
def table(fig,x,y,w,title,rows):
    header=42;rh=26;fig.box(x,y,w,header+rh*len(rows));fig.box(x,y,w,header,'#b8b8b8')
    fig.text(x+w/2,y+27,title,18,True,'middle');fig.line([(x+46,y+header),(x+46,y+header+rh*len(rows))])
    for i,(key,label) in enumerate(rows):
        yy=y+header+21+i*rh;fig.text(x+23,yy,key,13,True,'middle');fig.text(x+57,yy,label,15)
table(e,20,100,300,'users',[('PK','id'),('','tenant_id'),('','object_id'),('','display_name'),('','email'),('','created_at'),('','last_login_at')])
table(e,465,25,365,'assessments',[('PK','id'),('FK','user_id (nullable)'),('','daily_screen_time_hrs'),('','academic_app_usage_hrs'),('','social_media_hrs'),('','study_hours_per_day'),('','study_frequency_per_week'),('','predicted_gwa'),('','performance_category'),('','year_level'),('','program'),('','academic_term'),('','created_at'),('','submission_id'),('','request_hash')])
e.line([(320,190),(465,190)]);e.text(392,173,'owns',16,False,'middle')
def circle(fig,x,y,r=5):
    fig.c.setLineWidth(1.4);fig.c.setStrokeColor(colors.HexColor('#222222'));fig.c.setFillColor(colors.white);fig.c.circle(x,fig.h-y,r,stroke=1,fill=1)
    fig.svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="white" stroke="#222" stroke-width="1.4"/>')
# Match the actual nullable FK: an assessment has zero or one user.
e.line([(332,181),(332,199)]);circle(e,347,190)
circle(e,437,190);e.line([(450,190),(465,180)]);e.line([(450,190),(465,200)])
e.text(341,222,'0..1',14,False,'middle');e.text(447,222,'0..*',14,False,'middle')
e.text(20,496,'Unique identity: (tenant_id, object_id)',14)
e.text(465,496,'Unique submission: (user_id, submission_id)',14)
e.text(425,537,'Supporting tables (no declared foreign keys)',16,True,'middle')
table(e,20,557,300,'sessions',[('PK','id'),('UK','session_id'),('','data'),('','expiry')])
table(e,465,557,365,'schema_migrations',[('PK','version'),('','applied_at')])
e.save()

d=Figure('figure-3-8-context-diagram',1000,445)
for x in [15,860]:
    d.box(x,110,125,85);d.text(x+62.5,137,'USER',18,True,'middle')
    d.text(x+62.5,160,'Guest /',14,False,'middle');d.text(x+62.5,179,'Signed-in Student',14,False,'middle')
d.box(370,40,260,210,radius=9);d.line([(370,82),(630,82)]);d.text(500,71,'0',29,True,'middle')
for i,s in enumerate(['PLM Student Academic','Performance Prediction','System']):d.text(500,128+i*25,s,17,True,'middle')
for y,label in [(115,'Academic Profile & Habits'),(155,'Sign-in / Sign-out Requests'),(195,'History / Deletion Requests')]:
    d.text(255,y-10,label,14,False,'middle');d.line([(145,y),(365,y)],arrow=True)
for y,label in [(115,'GWA, Category & Suggestions'),(155,'Sign-in & Save Status'),(195,'History / Deletion Status')]:
    d.text(745,y-10,label,14,False,'middle');d.line([(635,y),(855,y)],arrow=True)
d.box(385,360,230,65);d.text(500,386,'MICROSOFT',18,True,'middle');d.text(500,410,'IDENTITY PLATFORM',17,True,'middle')
d.line([(450,250),(450,360)],arrow=True);d.text(440,293,'Authentication Request',14,False,'end')
d.line([(550,360),(550,250)],arrow=True);d.text(560,327,'Authentication Response',14)
d.save()

sections=[
('3.4 Conceptual Framework','Figure 3.4 Conceptual Framework for Academic Performance Predictor',f,[
"Figure 3.4 presents the conceptual framework of the implemented Academic Performance Predictor. It illustrates the predictive relationship between cellphone usage and study habits as independent variables and academic performance as the dependent variable.",
"Cellphone usage is represented by average daily screen time, daily academic phone use, and daily social media or entertainment phone use, measured in hours per day. Study habits are represented by average daily study hours and weekly study frequency, measured in hours per day and days per week, respectively. These five behavioral measures serve as the input variables of the predictive system. Program, year level, and academic term provide academic context for an assessment but are not input variables of the regression model.",
"The dependent variable is academic performance, represented by the numerical General Weighted Average (GWA). The system uses a single Linear Regression model to estimate GWA from the five behavioral inputs. The predicted GWA is limited to the 1.00-5.00 range and rounded to two decimal places. A corresponding performance category of Excellent, Good, Satisfactory, or Failing is then assigned using defined GWA thresholds rather than a separate classification model.",
"This framework describes the implemented model inputs; it does not separately measure study strategies or concentration. The model currently trains on synthetic data at startup. Its output is a prototype estimate, not an official grade or a prediction validated using the study's respondents. The arrow represents a predictive association rather than a causal relationship."
]),
('3.5 Entity-Relationship Diagram','Figure 3.5 Entity-Relationship Diagram for Academic Performance Predictor',e,[
"Figure 3.5 presents the Entity-Relationship Diagram based on the system's MySQL database. The two main entities are users and assessments, each identified by an id Primary Key. The users table stores Microsoft identity identifiers, display name, email, creation time, and last sign-in time. The combination of tenant_id and object_id uniquely identifies a Microsoft account. The assessments table stores the five behavioral inputs, predicted_gwa, performance_category, year_level, program, academic_term, and creation time. The academic profile fields are stored with each assessment rather than in the users table. The submission_id and request_hash fields support the handling of repeated submissions.",
"The relationship labeled \"owns\" is implemented through assessments.user_id, a Foreign Key referencing users.id. One user may own zero or many assessments. Because user_id permits NULL, an assessment may reference zero or one user at the database level. New assessments saved by signed-in students are linked to their account, while existing ownerless records remain excluded from account history. Guest predictions are not saved to assessment history. The combination of user_id and submission_id is unique for non-NULL values, supporting the reuse of an existing result when the same submission is retried.",
"The supporting sessions table stores the session identifier, serialized session data, and expiry time. Its session_id has a unique constraint. The schema_migrations table records applied database migration versions and their timestamps. Neither supporting table declares a Foreign Key, so no relational connector is drawn from these tables to users or assessments. Session data may contain account information, but that application-level association is not a declared database relationship."
]),
('3.7 Context Diagram','Figure 3.8 Context Diagram',d,[
"Figure 3.8 presents the Context Diagram of the PLM Student Academic Performance Prediction System as a single process numbered 0. The external entities are USER, representing a guest or a signed-in student, and the Microsoft Identity Platform, which provides Microsoft account authentication. The two USER boxes represent the same external entity and are repeated to distinguish incoming and outgoing data flows.",
"The user submits academic profile information and behavioral assessment inputs. The system returns the predicted GWA, its corresponding performance category, and rule-based suggestions. A guest can obtain an estimate without saving it to account history. A student who signs in using an accepted PLM Microsoft account can save assessments and submit requests to retrieve, filter, or delete their own assessment history. The system returns sign-in and save status, assessment history, and deletion status as appropriate.",
"For Microsoft sign-in, the system initiates an authentication request and receives the authentication response from the Microsoft Identity Platform. The system verifies the response and establishes an account session. Microsoft account credentials are entered with Microsoft rather than stored by the prediction system. The diagram describes external exchanges at the system boundary; the regression model, application server, database, and session storage remain internal components."
])]

pw,ph=A4;writer=PdfWriter();alltext=[]
style=ParagraphStyle('Body',fontName='Times-Roman',fontSize=12,leading=18,alignment=TA_JUSTIFY,firstLineIndent=26,spaceAfter=10)
for title,caption,fig,paragraphs in sections:
    layout=OUT/('_'+fig.name+'.pdf');c=canvas.Canvas(str(layout),pagesize=A4)
    c.setFont('Times-Bold',14);c.drawString(54,ph-60,title)
    scale=(pw-108)/fig.w;fh=fig.h*scale;bottom=ph-90-fh
    c.setFont('Times-Italic',11);c.drawCentredString(pw/2,bottom-23,caption)
    story=[Paragraph(escape(p),style) for p in paragraphs]
    top=bottom-48;frame=Frame(54,54,pw-108,top-54,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0);frame.addFromList(story,c);c.showPage()
    while story:
        c.setFont('Times-Bold',12);c.drawString(54,ph-60,title+' (continued)')
        frame=Frame(54,54,pw-108,ph-140,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0);frame.addFromList(story,c);c.showPage()
    c.save();reader=PdfReader(str(layout));reader.pages[0].merge_transformed_page(PdfReader(str(fig.path)).pages[0],Transformation().scale(scale).translate(54,bottom))
    for page in reader.pages:writer.add_page(page)
    layout.unlink();alltext.append(title+'\n'+caption+'\n\n'+'\n\n'.join(paragraphs))
writer.add_metadata({'/Title':'Updated Conceptual Framework, ERD, and Context Diagram - Schema-checked Revision'})
with (OUT/'updated-paper-diagrams-and-descriptions.pdf').open('wb') as stream:writer.write(stream)
(OUT/'updated-diagram-descriptions.txt').write_text('\n\n\n'.join(alltext)+'\n',encoding='utf-8')
(OUT/'review-notes.txt').write_text('VERIFICATION BASIS\nLive configured MySQL metadata: SHOW TABLES, SHOW COLUMNS, foreign-key metadata; no personal records were read. The ERD includes all four observed tables and all observed columns.\nNewer backend inspected read-only from local branch feature/mobile-friendly, commit ecaaab32fa53bbdfb65768bd06ab033117a52de3: acad_perf/web.py, acad_perf/predictor.py, acad_perf/history/account_history.py, acad_perf/history/migrate.py, and acad_perf/history/session_interface.py. This source matches the observed schema and the current frontend authentication/history API usage. The older root app.py on main differs and must not be used as the description of the newer account-based system. No branches or source application files were changed.\nContext flows verified against that newer backend and frontend/js/auth.js, frontend/js/assessment.js, and frontend/js/history.js. Microsoft authentication was inspected in source; no live sign-in, prediction submission, or history deletion was performed.\nConceptual framework: five implemented quantitative model inputs, not an assertion that the old paper\'s four questionnaire dimensions have been measured or validated. The original research instrument and methodology need reconciliation if retained. Synthetic training and the distinction between an estimate and an official grade are disclosed in the description.\nDatabase cardinality: assessments.user_id is nullable; the diagram therefore correctly shows zero or one user per assessment at schema level, despite new authenticated saves always attaching an owner. sessions has no user_id Foreign Key. Composite uniqueness: users(tenant_id, object_id), assessments(user_id, submission_id); sessions.session_id is unique.\n',encoding='utf-8')
doc=pdfium.PdfDocument(str(OUT/'updated-paper-diagrams-and-descriptions.pdf'))
for i in range(len(doc)):doc[i].render(scale=1.4).to_pil().save(ROOT/'tmp'/'pdfs'/f'updated-paper-page-{i+1}.png')
print('Created',OUT,'; compiled PDF pages:',len(doc))
