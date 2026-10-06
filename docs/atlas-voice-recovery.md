# Atlas Voice recovery loop

A voice turn is bounded and recoverable: listen → think → act → speak → listen. Assistant network work is capped at 8 seconds. A failed speech-output attempt no longer exits the conversation loop; Atlas returns to listening and keeps the transcript available. Recognition errors retry unless microphone permission is explicitly denied.
