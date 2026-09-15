import type { ExerciseContent } from "./exercises";

// Passage supplied by the project owner in Copy of 6th Grade Non-Fiction Passages.pdf.
export const dogPassage = `Dogs have been human companions for thousands of years, developing into hundreds of distinct breeds designed for specific jobs. Working breeds like the German Shepherd are famous for being exceptionally attentive. They stay focused on their surroundings, watching their owners closely for commands. Other dogs, like the energetic Jack Russell Terrier, can bring utter chaos into a quiet home if they do not get enough daily exercise to burn off their boundless energy.

When observing different breeds, paying attention to a dog's posture is essential. A broad-chested English Mastiff stands tall to signal confidence, whereas a frightened chihuahua might lower its body when scared. If an unfamiliar animal enters a guard dog's territory, the dog might adopt a ferocious stance to warn the intruder away. However, well-trained dogs learn to yield to their handlers, stepping back and yielding control whenever given a command.

Throughout history, humans have formed deep emotional bonds with their pets. A man might fondly look back on his boyhood, remembering the loyal Golden Retriever that followed him on every childhood adventure. Yet, dogs also experience powerful emotions. During loud thunderstorms or firework displays, a panicked hound might sprint frantically across the yard looking for shelter, while a hysterical lapdog might bark uncontrollably until comforted by its owner.

Responsibility is crucial when caring for any breed. Leaving a dog trapped inside a hot car on a summer day is pure torture for the animal and can cause severe harm. In fact, doing so is illegal in many places, carrying heavy fines or criminal charges. Understanding each breed's unique traits helps ensure every dog lives a safe, healthy, and happy life alongside its human family.`;
export const dogVocabulary: ExerciseContent["vocabulary"] = {
  chaos:{synonym:"disorder",definition:"A state of complete confusion or disorder."},
  illegal:{synonym:"unlawful",definition:"Not allowed by law."},
  torture:{synonym:"agony",definition:"Severe physical or mental suffering."},
  posture:{synonym:"stance",definition:"The position in which a body is held."},
  hysterical:{synonym:"uncontrollable",definition:"So overwhelmed by emotion that it is hard to stay calm."},
  attentive:{synonym:"watchful",definition:"Paying close attention to what is happening."},
  boyhood:{synonym:"childhood",definition:"The time in a boy's life before he becomes an adult."},
  panicked:{synonym:"terrified",definition:"Suddenly filled with fear and unable to think calmly."},
  ferocious:{synonym:"fierce",definition:"Very fierce or threatening."},
  yield:{synonym:"surrender",definition:"To give way or let someone else take control."},
};
export const exercisePresets: {key:string; content:ExerciseContent}[] = [
  {key:"dogs-missing",content:{title:"Dog Detectives · Disappearing Words",passage:dogPassage,strategy:"missing",mode:"type",targetWords:Object.keys(dogVocabulary),vocabulary:dogVocabulary}},
  {key:"dogs-mixed",content:{title:"Dog Detectives · Twist & Swap",passage:dogPassage,strategy:"mixed",mode:"type",targetWords:Object.keys(dogVocabulary),vocabulary:dogVocabulary}},
  {key:"dogs-endings",content:{title:"Dog Detectives · Missing Endings",passage:dogPassage,strategy:"endings",mode:"type",targetWords:["developing","designed","working","focused","watching","observing","stepping","formed","remembering","followed","comforted","carrying"],vocabulary:dogVocabulary}},
  {key:"dogs-context",content:{title:"Dog Detectives · Context Clues",passage:dogPassage,strategy:"definition",mode:"type",targetWords:Object.keys(dogVocabulary),vocabulary:dogVocabulary}},
];
