from pathlib import Path
from html import escape
import zipfile
from pypdf import PdfReader, PdfWriter, Transformation
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.platypus import Frame, Paragraph
import pypdfium2 as pdfium

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output'/'paper-data-flow-diagrams'
OUT.mkdir(parents=True,exist_ok=True)
# Reuse the previously reviewed vector drawing helper without executing its figures.
helper=(ROOT/'tmp/paper-architecture/build_updated_diagrams.py').read_text(encoding='utf-8').split("f=Figure('figure-3-4-conceptual-framework'")[0]
ns={'__file__':str(ROOT/'tmp/paper-architecture/build_updated_diagrams.py')}
exec(compile(helper,'drawing-helper','exec'),ns)
ns['OUT']=OUT
Figure=ns['Figure']

def entity(f,x,y,w,h,lines):
    f.box(x,y,w,h)
    center=y+h/2-(len(lines)-1)*10+6
    for i,line in enumerate(lines):f.text(x+w/2,center+i*20,line,17,True,'middle')

def process(f,x,y,w,h,number,lines):
    f.box(x,y,w,h,radius=12);f.line([(x,y+35),(x+w,y+35)])
    f.text(x+w/2,y+25,number,19,True,'middle')
    for i,line in enumerate(lines):f.text(x+w/2,y+62+i*20,line,17,True,'middle')

def store(f,x,y,w,title):
    f.box(x,y,w,48);f.line([(x+47,y),(x+47,y+48)])
    f.text(x+23,y+30,title[0],15,True,'middle');f.text(x+58,y+30,title[1],16,True)

f=Figure('figure-3-6-level-0-data-flow',1000,520)
entity(f,15,130,145,130,['STUDENT','Guest or','Signed-in'])
process(f,390,80,310,230,'0',['PLM Student Academic','Performance Prediction','System'])
for i,line in enumerate(['Academic profile & habits','Sign-in / sign-out requests','History / deletion requests']):
    f.text(275,103+i*17,line,14,False,'middle')
f.line([(165,162),(385,162)],arrow=True)
f.line([(385,228),(165,228)],arrow=True)
for i,line in enumerate(['GWA, category & suggestions','Sign-in / save status','History / deletion status','Validation feedback']):
    f.text(275,250+i*17,line,14,False,'middle')
entity(f,423,420,245,70,['MICROSOFT','IDENTITY PLATFORM'])
f.line([(490,310),(490,420)],arrow=True);f.text(480,356,'Authentication request',14,False,'end')
f.line([(600,420),(600,310)],arrow=True);f.text(610,385,'Authentication response',14)
f.save()

g=Figure('figure-3-7-level-1-data-flow',1050,1070)
# Auth process and external identity provider.
entity(g,15,35,155,90,['STUDENT','Guest or','Signed-in'])
process(g,345,35,285,110,'1.0',['Authenticate User','& Manage Session'])
entity(g,850,35,180,90,['MICROSOFT','IDENTITY','PLATFORM'])
g.text(255,52,'Sign-in / sign-out request',14,False,'middle');g.line([(175,60),(340,60)],arrow=True)
g.text(255,110,'Sign-in / session status',14,False,'middle');g.line([(340,95),(175,95)],arrow=True)
g.text(740,52,'Authentication request',14,False,'middle');g.line([(635,60),(845,60)],arrow=True)
g.text(740,110,'Authentication response',14,False,'middle');g.line([(845,95),(635,95)],arrow=True)
store(g,740,190,290,('D1','Users & Sessions'))
g.line([(550,145),(550,200),(735,200)],arrow=True);g.text(625,188,'Account / session updates',13,False,'middle')
g.line([(735,226),(590,226),(590,150)],arrow=True);g.text(661,245,'Account / session data',13,False,'middle')

# Validation and prediction; repeated STUDENT represents the same external entity.
entity(g,15,330,155,90,['STUDENT','Guest or','Signed-in'])
process(g,345,320,285,110,'2.0',['Validate Assessment','Inputs'])
g.line([(470,145),(470,315)],arrow=True);g.text(455,286,'Session status',14,False,'end')
g.text(255,348,'Academic profile & habits',14,False,'middle');g.line([(175,355),(340,355)],arrow=True)
g.text(255,407,'Validation feedback',14,False,'middle');g.line([(340,392),(175,392)],arrow=True)
process(g,345,520,285,110,'3.0',['Predict GWA &','Assign Category'])
g.line([(485,430),(485,515)],arrow=True);g.text(500,477,'Validated behavioral inputs',14)
g.text(487,665,'Linear Regression trained on synthetic data at startup',14,False,'middle')

# Result and history handling with the account-owned assessments store.
entity(g,15,815,155,100,['STUDENT','Guest or','Signed-in'])
process(g,345,800,285,130,'4.0',['Manage Results','& Assessment History'])
g.line([(485,630),(485,795)],arrow=True);g.text(500,716,'Predicted GWA, category',14);g.text(500,734,'& suggestions',14)
g.line([(630,385),(690,385),(690,865),(635,865)],arrow=True)
g.text(700,615,'Validated academic',14);g.text(700,633,'profile, inputs &',14);g.text(700,651,'session status',14)
g.text(255,831,'History / deletion requests',14,False,'middle');g.line([(175,838),(340,838)],arrow=True)
g.text(255,905,'Result, history & status',14,False,'middle');g.line([(340,885),(175,885)],arrow=True)
store(g,740,815,290,('D2','Assessments'))
g.line([(635,828),(735,828)],arrow=True);g.text(685,815,'Save / delete',13,False,'middle')
g.line([(735,852),(635,852)],arrow=True);g.text(685,876,'Saved records',13,False,'middle')
g.text(487,984,'Guest estimates are returned without saving; signed-in users access their own history.',14,False,'middle')
g.save()

parts=[
('3.6 Data Flow Diagram','Figure 3.6 Level 0 Data Flow Diagram for Academic Performance Predictor',f,[
"Figure 3.6 presents the Level 0 Data Flow Diagram of the PLM Student Academic Performance Prediction System. Process 0 represents the system as a whole. The Student, who may be a guest or a signed-in user, provides academic profile details and behavioral assessment inputs, as well as sign-in, sign-out, history, and deletion requests. The system returns the predicted GWA, performance category, suggestions, validation feedback, account and save status, and history or deletion results as applicable.",
"The Microsoft Identity Platform is the external authentication service. The system sends an authentication request and receives an authentication response when a user signs in. Guests can obtain estimates without saving them to account history. Signed-in users can save assessments and manage their own history. The diagram describes exchanges at the system boundary; internal processing is expanded in Figure 3.7."
]),
('3.6 Data Flow Diagram (continued)','Figure 3.7 Level 1 Data Flow Diagram for Academic Performance Predictor',g,[
"Figure 3.7 presents the Level 1 Data Flow Diagram, which decomposes Process 0 into four processes. In Process 1.0, the system handles Microsoft sign-in and account sessions. It exchanges authentication requests and responses with the Microsoft Identity Platform and accesses D1, the MySQL user and session records. The Student is repeated in the diagram for readability and represents the same external entity throughout.",
"In Process 2.0, the system validates the student's academic profile and assessment inputs and checks the session state. The five behavioral measures are passed to Process 3.0, where Linear Regression estimates GWA and the system assigns a category from the resulting GWA. Rule-based suggestions are returned with the result. The model is trained on synthetic data when the application starts; the diagram therefore does not show stored model files.",
"Process 4.0 manages results and assessment history. It returns the estimate, category, and suggestions to the student. For a signed-in user, it saves successful assessments and handles requests to retrieve or delete that user's records in D2, the assessments table. Guest estimates are returned without being saved to account history. Input validation feedback, sign-in status, save status, history, and deletion status are returned when applicable."
])]

pw,ph=A4;writer=PdfWriter();alltext=[]
style=ParagraphStyle('Body',fontName='Times-Roman',fontSize=12,leading=18,alignment=TA_JUSTIFY,firstLineIndent=26,spaceAfter=10)
for heading,caption,figure,paragraphs in parts:
    layout=OUT/('_'+figure.name+'.pdf');c=canvas.Canvas(str(layout),pagesize=A4)
    c.setFont('Times-Bold',14);c.drawString(54,ph-60,heading)
    scale=(pw-108)/figure.w;fh=figure.h*scale;bottom=ph-90-fh
    c.setFont('Times-Italic',11);c.drawCentredString(pw/2,bottom-23,caption)
    story=[Paragraph(escape(p),style) for p in paragraphs]
    top=bottom-48
    Frame(54,54,pw-108,top-54,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0).addFromList(story,c)
    c.showPage()
    while story:
        c.setFont('Times-Bold',12);c.drawString(54,ph-60,'3.6 Data Flow Diagram (continued)')
        Frame(54,54,pw-108,ph-140,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0).addFromList(story,c);c.showPage()
    c.save();pages=PdfReader(str(layout));pages.pages[0].merge_transformed_page(PdfReader(str(figure.path)).pages[0],Transformation().scale(scale).translate(54,bottom))
    for page in pages.pages:writer.add_page(page)
    layout.unlink();alltext.append(heading+'\n'+caption+'\n\n'+'\n\n'.join(paragraphs))
writer.add_metadata({'/Title':'Updated Level 0 and Level 1 Data Flow Diagrams'})
pdf=OUT/'updated-data-flow-diagrams-and-descriptions.pdf'
with pdf.open('wb') as stream:writer.write(stream)
(OUT/'updated-data-flow-descriptions.txt').write_text('\n\n\n'.join(alltext)+'\n',encoding='utf-8')
(OUT/'verification-notes.txt').write_text('Source: the paper\'s Figures 3.6 and 3.7 and local feature/mobile-friendly commit ecaaab32fa53bbdfb65768bd06ab033117a52de3: acad_perf/web.py, acad_perf/predictor.py, acad_perf/history/account_history.py and migrate.py, plus current frontend assessment, auth and history JavaScript. The main branch has an older, different backend; these diagrams describe the newer account-based version, not a verified live deployment. MySQL schema metadata was checked in the prior diagram revision. No live authentication, prediction or deletion was performed. D1 groups the users and sessions tables as one logical data store. D2 represents assessments. The model trains on synthetic data at startup and is not loaded from model files. The scope of Figure 3.6 matches the separately prepared context diagram; the paper labels both as Level 0-style views. The earlier paper incorrectly labels Figure 3.7 Level 0 in its caption; this version labels it Level 1.\n',encoding='utf-8')
doc=pdfium.PdfDocument(str(pdf));qa=ROOT/'tmp/pdfs';qa.mkdir(parents=True,exist_ok=True)
for i in range(len(doc)):doc[i].render(scale=1.4).to_pil().save(qa/f'updated-dfd-page-{i+1}.png')
with zipfile.ZipFile(OUT/'data-flow-diagrams.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for path in OUT.iterdir():
        if path.suffix in ('.pdf','.svg','.png','.txt'):archive.write(path,path.name)
print('Created',pdf,'with',len(doc),'pages')
